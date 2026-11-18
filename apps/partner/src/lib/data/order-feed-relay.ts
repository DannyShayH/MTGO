import {
  sessionEndedCodeForStatus,
  type FeedEndedCode,
  type SessionEndedCode,
} from "../session-ended.ts"

/**
 * The kitchen feed relay and its polling check (#148), free of Next.js and
 * the SDK so their behavior is tested directly; `order-feed.ts` passes in
 * the request's cookie token and the SDK calls.
 */

/**
 * The relay's headers: `no-transform` keeps Next.js compression and the
 * staging Caddy from buffering the events (Caddy flushes event streams).
 */
export const ORDER_FEED_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

/** One Server-Sent Event as the SDK's `fetchStream` yields it. */
export type FeedMessage = { event?: string; data?: string }

export type Upstream = {
  stream: AsyncIterable<FeedMessage>
  abort: () => void
}

/** The polling check's answer; `ended` names why the session ended. */
export type OrdersCheck =
  | { status: "ok"; server_time: string }
  | { status: "ended"; code: FeedEndedCode }
  | { status: "unavailable" }

/** Why a failed backend call ended the session, if it did (by status only). */
export const endedCodeOfFailure = (
  error: unknown,
): SessionEndedCode | undefined => {
  const status = (error as { status?: unknown } | null)?.status
  return sessionEndedCodeForStatus(
    typeof status === "number" ? status : undefined,
  )
}

/**
 * Relays the backend kitchen feed to the browser. A missing token or a
 * refused feed becomes an `ended` event; any other failure just closes, so
 * the screen reconnects or falls back to polling. Closing the browser
 * connection aborts the backend stream.
 */
export function relayFeed({
  token,
  openUpstream,
  signal,
  onFailure,
}: {
  token: string | undefined
  openUpstream: (token: string) => Promise<Upstream>
  signal: AbortSignal
  onFailure: (error: unknown) => void
}): Response {
  const encoder = new TextEncoder()
  let abortUpstream = () => {}
  const relayEvents = async (controller: ReadableStreamDefaultController) => {
    const write = (event: string, data: string) =>
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
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
        if (message.event) write(message.event, message.data ?? "{}")
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
  return new Response(body, { headers: ORDER_FEED_HEADERS })
}

/**
 * Asks whether the authorized Orders read works right now, through the
 * smallest page of the real queue contract, so a success proves the same
 * path the screen then reloads through.
 */
export async function checkOrdersWith({
  token,
  readQueue,
  onFailure,
}: {
  token: string | undefined
  readQueue: (token: string) => Promise<{ server_time: string }>
  onFailure: (error: unknown) => void
}): Promise<OrdersCheck> {
  if (!token) return { status: "ended", code: "signed_out" }
  try {
    const { server_time } = await readQueue(token)
    return { status: "ok", server_time }
  } catch (error) {
    const code = endedCodeOfFailure(error)
    if (code) return { status: "ended", code }
    onFailure(error)
    return { status: "unavailable" }
  }
}
