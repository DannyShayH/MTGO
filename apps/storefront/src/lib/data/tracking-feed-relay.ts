/**
 * The Customer tracking feed relay (#215), free of Next.js and the SDK so
 * its behavior is tested directly; `tracking-feed.ts` passes in the
 * request's cookie token and the SDK's stream call.
 */

/**
 * The relay's headers: `no-transform` keeps Next.js compression and the
 * staging Caddy from buffering the events (Caddy flushes event streams).
 */
export const TRACKING_FEED_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

/** Why the feed ended; the page stops tracking and clears the Order's data. */
export type TrackingEndedCode =
  "signed_out" | "session_expired" | "sign_in_required" | "order_unavailable"

/** One Server-Sent Event as the SDK's `fetchStream` yields it. */
export type TrackingFeedMessage = { event?: string; data?: string }

export type TrackingUpstream = {
  stream: AsyncIterable<TrackingFeedMessage>
  abort: () => void
}

/** The backend feed's own events; anything else is not passed on. */
const FEED_EVENTS = new Set(["ready", "heartbeat", "tracking", "ended"])

/**
 * The HTTP status of a failed backend stream, by status only. The SDK's
 * `fetchStream` rejects a refused request with a `FetchError` carrying it.
 */
export function statusOfStreamFailure(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === "number" ? status : undefined
}

/** A refusal ends tracking; one code for 404 never reveals whether the Order exists. */
const endedCodeOfFailure = (error: unknown): TrackingEndedCode | undefined => {
  const status = statusOfStreamFailure(error)
  if (status === 401 || status === 403) return "sign_in_required"
  if (status === 404) return "order_unavailable"
  return undefined
}

/**
 * Relays the backend tracking feed to the browser on the same origin, so
 * the Customer's bearer token stays on the server. A missing token or a
 * refused feed becomes an `ended` event; any other failure just closes, so
 * the page falls back to checking. Events are written as they arrive, and
 * closing the browser connection aborts the backend stream.
 */
export function relayTrackingFeed({
  token,
  openUpstream,
  signal,
  onFailure,
}: {
  token: string | undefined
  openUpstream: (token: string) => Promise<TrackingUpstream>
  signal: AbortSignal
  onFailure: (error: unknown) => void
}): Response {
  const encoder = new TextEncoder()
  let abortUpstream = () => {}
  const relayEvents = async (controller: ReadableStreamDefaultController) => {
    const write = (event: string, data: string) => {
      try {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      } catch {
        // The browser already closed the connection.
      }
    }
    const close = () => {
      try {
        controller.close()
      } catch {
        // Already closed by the browser.
      }
    }
    if (!token) {
      write("ended", JSON.stringify({ code: "signed_out" }))
      return close()
    }
    try {
      const { stream, abort } = await openUpstream(token)
      abortUpstream = abort
      if (signal.aborted) abort()
      for await (const message of stream) {
        if (signal.aborted) break
        if (message.event && FEED_EVENTS.has(message.event))
          write(message.event, message.data ?? "{}")
      }
    } catch (error) {
      const code = endedCodeOfFailure(error)
      if (code) write("ended", JSON.stringify({ code }))
      else if (!signal.aborted) onFailure(error)
    }
    abortUpstream()
    close()
  }
  signal.addEventListener("abort", () => abortUpstream(), { once: true })
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Not awaited: events flow while the backend stream stays open.
      void relayEvents(controller)
    },
    cancel() {
      abortUpstream()
    },
  })
  return new Response(body, { headers: TRACKING_FEED_HEADERS })
}
