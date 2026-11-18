import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createLogRecord, requestId } from "@dtc/logging"
import { sessionExpiresAt } from "../../../session-expiry"
import { readPartnerOrderFeedWorkflow } from "../../../../workflows/order-operations"
import type { AnnouncedRevisions } from "../../../../workflows/order-operations/order-feed"

/** How often the open feed rechecks staff access and rereads Order revisions. */
const FEED_RECHECK_MS = 1000
/**
 * A quiet feed still proves it is alive at least this often. The first
 * heartbeat follows the first successful tick, so the screen shows "live"
 * only once a read after `ready` has gone through (#148).
 */
const HEARTBEAT_MS = 15000

/** Why the server ended the feed; the partner app ends the session for both. */
type EndedCode = "staff_access_revoked" | "session_expired"

/**
 * Medusa's graceful shutdown waits for open connections, and a feed never
 * finishes on its own: the old process would keep streaming while refusing
 * every other request. Open feeds therefore end on the shutdown signal, so a
 * deploy completes and kitchen screens reconnect to the new process.
 */
const openFeeds = new Set<() => void>()
let isShutdownWatched = false
function endFeedOnShutdown(end: () => void) {
  if (!isShutdownWatched) {
    isShutdownWatched = true
    const endAll = () => openFeeds.forEach((endFeed) => endFeed())
    process.once("SIGTERM", endAll)
    process.once("SIGINT", endAll)
  }
  openFeeds.add(end)
  return () => openFeeds.delete(end)
}

const isRevoked = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === "staff_access_revoked"

/**
 * The kitchen feed (#148): Server-Sent Events with small invalidation hints
 * for the staff member's own Restaurant. Every tick rechecks staff access and
 * the token's expiry (kept by `recordSessionExpiry`) before reading, and
 * closing the connection stops it.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const staffId = req.auth_context.actor_id
  let announced: AnnouncedRevisions = {}
  const readFeed = async () => {
    const { result } = await readPartnerOrderFeedWorkflow(req.scope).run({
      input: { staff_id: staffId, announced },
    })
    announced = result.announced
    return result
  }
  // Authorize and take the baseline before opening: a refusal stays an
  // ordinary error response, and nothing changed after `ready` is missed.
  await readFeed()
  const expiresAt = sessionExpiresAt(res)

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform keeps Caddy and Next.js from compressing (buffering) it.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  let isOpen = true
  let timer: NodeJS.Timeout | undefined
  let lastWrite = Date.now()
  let isProven = false
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    lastWrite = Date.now()
  }
  let forgetFeed = () => false
  const stop = () => {
    isOpen = false
    clearTimeout(timer)
    forgetFeed()
  }
  const end = (code?: EndedCode) => {
    if (code) send("ended", { code })
    stop()
    res.end()
  }
  req.on("close", stop)
  // Without `ended`, the partner app reconnects (to the new process).
  forgetFeed = endFeedOnShutdown(() => end())
  send("ready", { server_time: new Date().toISOString() })

  const tick = async () => {
    if (!isOpen) return
    if (expiresAt !== undefined && Date.now() >= expiresAt)
      return end("session_expired")
    try {
      const { hints, server_time } = await readFeed()
      if (!isOpen) return
      if (hints.length) send("orders", { orders: hints })
      else if (!isProven || Date.now() - lastWrite >= HEARTBEAT_MS)
        send("heartbeat", { server_time })
      isProven = true
    } catch (error) {
      if (!isOpen) return
      if (isRevoked(error)) return end("staff_access_revoked")
      const record = createLogRecord("backend", "request.failed", {
        request_id: requestId(req.headers["x-request-id"]),
        route: "/partner/orders/stream",
        method: "GET",
        err: error,
      })
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
      // Closing without `ended` lets the partner app reconnect or fall back.
      return end()
    }
    timer = setTimeout(tick, FEED_RECHECK_MS)
  }
  timer = setTimeout(tick, FEED_RECHECK_MS)
}
