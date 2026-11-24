import { channel } from "node:diagnostics_channel"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { Histogram, Registry } from "@prometheus-io/client"

/** Node publishes every incoming request on this channel before routing. */
const requestStart = channel("http.server.request.start")

/**
 * Pages whose server-side render time is measured, matched on the raw path
 * before any label is chosen. The label is the fixed App Router pattern,
 * never the Restaurant id or the query string.
 */
const PAGES = [
  {
    pattern: /^\/[a-z]{2}\/restaurants\/[^/]+\/?$/i,
    route: "/[countryCode]/restaurants/[id]",
  },
]

/** How the browser asked for the render. */
type RenderKind = "document" | "navigation" | "prefetch" | "action"
const KINDS: RenderKind[] = ["document", "navigation", "prefetch", "action"]

/**
 * A full page load, a client-side navigation (React Server Components
 * payload), a link prefetch, or a server action (basket changes) that
 * answers with a fresh render of the page. Anything else is not observed.
 */
function kindOf(request: IncomingMessage): RenderKind | undefined {
  if (request.method === "POST")
    return request.headers["next-action"] ? "action" : undefined
  if (request.method !== "GET") return undefined
  if (request.headers["next-router-prefetch"]) return "prefetch"
  return request.headers.rsc ? "navigation" : "document"
}

/** Same buckets as the backend route histogram, so the panels compare. */
const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10,
]

const isPort = (port: number) =>
  Number.isInteger(port) && port >= 1 && port <= 65535

/**
 * Server-side render time of the storefront's measured pages, from request
 * start to the last byte of the response, on a private exporter that serves
 * only `GET /metrics`. Redirects and renders whose connection closed first
 * are not observed. Returns a function that stops it.
 */
export function startPageRenderMetrics({
  host,
  port,
  appPort,
  warn = () => {},
}: {
  host: string
  port: number
  appPort: number
  warn?: () => void
}): () => void {
  if (!isPort(port) || !isPort(appPort) || port === appPort)
    throw new Error("Invalid metrics listener configuration")

  const registry = new Registry()
  const duration = new Histogram({
    name: "mtogo_storefront_page_render_duration_seconds",
    help: "Server-side seconds of a storefront page render, from request start to response finish",
    labelNames: ["route", "kind"] as const,
    buckets: DURATION_BUCKETS_SECONDS,
    registers: [registry],
  })
  // Zero baselines: a quiet window is an observation, not a missing series.
  for (const { route } of PAGES)
    for (const kind of KINDS) duration.zero({ route, kind })

  let isStopped = false
  const pending = new Set<() => void>()
  const observe = (message: unknown) => {
    const { request, response } = message as {
      request: IncomingMessage
      response: ServerResponse
    }
    // Diagnostics channels are process-wide: only the app's own listener.
    if (request.socket.localPort !== appPort) return
    const path = (request.url || "").split("?")[0]
    const page = PAGES.find(({ pattern }) => pattern.test(path))
    const kind = page && kindOf(request)
    if (!page || !kind) return
    const startedAt = process.hrtime.bigint()
    const cleanup = () => {
      response.off("finish", settle)
      response.off("close", settle)
      pending.delete(cleanup)
    }
    const settle = () => {
      cleanup()
      if (isStopped || !response.writableFinished) return
      // A redirect, such as the region middleware's, renders no page.
      if (response.statusCode >= 300 && response.statusCode < 400) return
      duration.observe(
        { route: page.route, kind },
        Number(process.hrtime.bigint() - startedAt) / 1e9,
      )
    }
    pending.add(cleanup)
    response.once("finish", settle)
    response.once("close", settle)
  }

  const exporter = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/metrics") {
      response.writeHead(404).end()
      return
    }
    try {
      response.setHeader("content-type", registry.contentType)
      response.end(await registry.metrics())
    } catch {
      response.writeHead(503).end()
    }
  })
  exporter.requestTimeout = 5000
  exporter.headersTimeout = 5000

  const stop = () => {
    if (isStopped) return
    isStopped = true
    requestStart.unsubscribe(observe)
    pending.forEach((cleanup) => cleanup())
    exporter.close()
    // Present at runtime (Node 18.2+); the storefront's Node types predate it.
    ;(exporter as { closeAllConnections?: () => void }).closeAllConnections?.()
    registry.clear()
  }
  exporter.on("error", () => {
    stop()
    warn()
  })
  requestStart.subscribe(observe)
  exporter.listen(port, host)
  exporter.unref()
  return stop
}
