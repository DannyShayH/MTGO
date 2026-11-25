/** One parsed Server-Sent Event. */
export type StreamEvent = { event: string; data: Record<string, unknown> }

/**
 * Opens a Server-Sent Events response with `fetch` and collects its events,
 * so a spec can wait for one (`next`), read everything sent as text (`raw`)
 * for privacy checks, and see whether the server closed it (`ended`).
 */
export async function openEventStream(
  url: string,
  headers: Record<string, string>,
  waitMs = 20_000,
) {
  const controller = new AbortController()
  const response = await fetch(url, {
    headers: { ...headers, accept: "text/event-stream" },
    signal: controller.signal,
  })
  const events: StreamEvent[] = []
  let raw = ""
  let waiting: (() => void) | undefined
  let isClosed = false
  const pump = (async () => {
    if (!response.ok || !response.body) return
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      for await (const chunk of response.body) {
        const text = decoder.decode(chunk as Uint8Array, { stream: true })
        raw += text
        buffer += text
        let end: number
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const field = (name: string) =>
            block
              .split("\n")
              .find((line) => line.startsWith(`${name}: `))
              ?.slice(name.length + 2)
          const event = field("event")
          if (event)
            events.push({ event, data: JSON.parse(field("data") ?? "{}") })
          waiting?.()
        }
      }
    } catch {
      // Aborted by the spec.
    } finally {
      isClosed = true
      waiting?.()
    }
  })()
  const next = async (
    event: string,
    matches: (data: Record<string, unknown>) => boolean = () => true,
  ) => {
    const deadline = Date.now() + waitMs
    for (;;) {
      const index = events.findIndex(
        (entry) => entry.event === event && matches(entry.data),
      )
      if (index >= 0) return events.splice(index, 1)[0].data
      if (isClosed) throw new Error(`stream closed before "${event}"`)
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`no "${event}" within ${waitMs} ms`)
      await new Promise<void>((resolve) => {
        waiting = resolve
        setTimeout(resolve, left)
      })
    }
  }
  return {
    response,
    events,
    next,
    raw: () => raw,
    ended: () =>
      Promise.race([
        pump.then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), waitMs),
        ),
      ]),
    close: () => controller.abort(),
  }
}

export type EventStream = Awaited<ReturnType<typeof openEventStream>>
