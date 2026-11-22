import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createLogRecord, requestId } from "@dtc/logging"
import { sessionExpiresAt } from "../../../session-expiry"
import { readDeliveryFeedWorkflow } from "../../../../workflows/delivery/feed"
import type { DeliveryFeedState } from "../../../../workflows/delivery/delivery-feed"

/** How often the open feed rechecks agent access and rereads durable state. */
const FEED_RECHECK_MS = 2000
/**
 * A quiet feed still proves it is alive at least this often. The first
 * heartbeat follows the first successful tick, so the screen shows "live"
 * only once a read after `ready` has gone through (as the kitchen feed, #148).
 */
const HEARTBEAT_MS = 15000

/** Why the server ended the feed; the partner app signs the agent out for both. */
type EndedCode = "delivery_agent_access_revoked" | "session_expired"

/**
 * Medusa's graceful shutdown waits for open connections and a feed never
 * ends on its own, so open feeds end on the shutdown signal. Phones then
 * reconnect to the new process.
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
  (error as { code?: unknown } | null)?.code === "delivery_agent_access_revoked"

/**
 * The Delivery agent feed (#165): Server-Sent Events with small invalidation
 * hints (`available`, `current`) for the authenticated agent only. A hint
 * carries no delivery, Customer or location data; the phone rereads through
 * the authorized projections, so a hint never establishes a claim or a
 * milestone. Every tick rechecks agent access and the token's expiry before
 * reading, and closing the connection stops the timer.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const agentId = req.auth_context.actor_id
  let announced: DeliveryFeedState | null = null
  const readFeed = async () => {
    const { result } = await readDeliveryFeedWorkflow(req.scope).run({
      input: { agent_id: agentId, announced },
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
      const { scopes, server_time } = await readFeed()
      if (!isOpen) return
      if (scopes.length) send("deliveries", { scopes })
      else if (!isProven || Date.now() - lastWrite >= HEARTBEAT_MS)
        send("heartbeat", { server_time })
      isProven = true
    } catch (error) {
      if (!isOpen) return
      if (isRevoked(error)) return end("delivery_agent_access_revoked")
      const record = createLogRecord("backend", "request.failed", {
        request_id: requestId(req.headers["x-request-id"]),
        route: "/partner/deliveries/stream",
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
