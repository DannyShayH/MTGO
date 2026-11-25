import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createLogRecord, requestId } from "@dtc/logging"
import { sessionExpiresAt } from "../../../../../session-expiry"
import { hasIsolatedCustomerIdentity } from "../../../../../customer-identity"
import {
  EVENT_STREAM_HEADERS,
  endFeedOnShutdown,
} from "../../../../../event-stream"
import { readCustomerTrackingFeedWorkflow } from "../../../../../../workflows/order-operations"

/** How often the open feed rechecks access and rereads the tracking record. */
const FEED_RECHECK_MS = 2000
/**
 * A quiet feed still proves it is alive at least this often. The first
 * heartbeat follows the first successful tick, so the page claims "live"
 * only once a read after `ready` has gone through (as the partner feeds).
 */
const HEARTBEAT_MS = 15000
/**
 * Heartbeats only go out on a tick, so one is due once the next tick would
 * pass `HEARTBEAT_MS`; waiting for the deadline itself would overshoot it.
 */
const HEARTBEAT_DUE_MS = HEARTBEAT_MS - FEED_RECHECK_MS

/** Why the server ended the feed; the page stops tracking and clears it. */
type EndedCode = "session_expired" | "sign_in_required" | "order_unavailable"

const isNotFound = (error: unknown) =>
  (error as { type?: unknown } | null)?.type === MedusaError.Types.NOT_FOUND

/**
 * The Customer tracking feed (#215): Server-Sent Events whose `tracking`
 * hint carries only the change token of the Order's tracking read, never a
 * milestone, a position or another Order detail. The page rereads
 * `GET /store/orders/:id/tracking` on every hint, so the stream is never
 * the record. The middleware authorizes before anything opens; every tick
 * then rechecks the token's expiry, the Customer's sign-in and ownership
 * before reading. Closing the connection or shutting down stops the timer.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const input = {
    order_id: req.params.id,
    customer_id: req.auth_context.actor_id,
  }
  const readChangeToken = async () =>
    (await readCustomerTrackingFeedWorkflow(req.scope).run({ input })).result
  // The baseline before opening: a failed read stays an ordinary error
  // response, and nothing changed after `ready` is missed.
  let announced = (await readChangeToken()).change_token
  const expiresAt = sessionExpiresAt(res)

  res.writeHead(200, EVENT_STREAM_HEADERS)
  let isOpen = true
  let timer: NodeJS.Timeout | undefined
  let lastWrite = Date.now()
  let isProven = false
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    lastWrite = Date.now()
  }
  let forgetFeed = () => {}
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
  // Without `ended`, the page reconnects (to the new process) or polls.
  forgetFeed = endFeedOnShutdown(() => end())
  send("ready", { server_time: new Date().toISOString() })

  const tick = async () => {
    if (!isOpen) return
    if (expiresAt !== undefined && Date.now() >= expiresAt)
      return end("session_expired")
    try {
      if (!(await hasIsolatedCustomerIdentity(req)))
        return isOpen ? end("sign_in_required") : undefined
      const { change_token, server_time } = await readChangeToken()
      if (!isOpen) return
      if (change_token !== announced) {
        announced = change_token
        send("tracking", { change_token })
      } else if (!isProven || Date.now() - lastWrite >= HEARTBEAT_DUE_MS)
        send("heartbeat", { server_time })
      isProven = true
    } catch (error) {
      if (!isOpen) return
      if (isNotFound(error)) return end("order_unavailable")
      const record = createLogRecord("backend", "request.failed", {
        request_id: requestId(req.headers["x-request-id"]),
        route: "/store/orders/:id/tracking/stream",
        method: "GET",
        err: error,
      })
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
      // A failed durable read closes without `ended`: the page falls back.
      return end()
    }
    timer = setTimeout(tick, FEED_RECHECK_MS)
  }
  timer = setTimeout(tick, FEED_RECHECK_MS)
}
