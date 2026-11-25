/**
 * The headers of every Server-Sent Events feed. `no-transform` keeps Caddy
 * and the Next.js relays from compressing (and so buffering) the events, and
 * `X-Accel-Buffering: no` asks any other proxy not to buffer them.
 */
export const EVENT_STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

/**
 * Medusa's graceful shutdown waits for open connections, and a feed never
 * finishes on its own: the old process would keep streaming while refusing
 * every other request. Open feeds therefore end on the shutdown signal, so a
 * deploy completes and the screens reconnect to the new process. Returns the
 * function that forgets the feed once it has ended.
 */
const openFeeds = new Set<() => void>()
let isShutdownWatched = false
export function endFeedOnShutdown(end: () => void): () => void {
  if (!isShutdownWatched) {
    isShutdownWatched = true
    const endAll = () => openFeeds.forEach((endFeed) => endFeed())
    process.once("SIGTERM", endAll)
    process.once("SIGINT", endAll)
  }
  openFeeds.add(end)
  return () => {
    openFeeds.delete(end)
  }
}
