import { subscribe, unsubscribe } from "node:diagnostics_channel"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "@prometheus-io/client"
import { MedusaError } from "@medusajs/framework/utils"

type RequestStart = {
  request: IncomingMessage
  response: ServerResponse
}

const ALLOWED_HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
])

/**
 * Monitoring, probe and static traffic never enters the ordinary API totals.
 * Matched on the raw path before any label is chosen.
 */
const EXCLUDED_PATHS = [
  /^\/health\/?$/i,
  /^\/metrics\/?$/i,
  /^\/app(\/|$)/i,
  /^\/static\//i,
]

/** Server-sent event endpoints; their established streams are measured apart. */
const STREAM_PATHS = [/^\/partner\/orders\/stream\/?$/i]

const pathOf = (url: string) => url.split("?")[0]

/** Health, scrape, Admin and static paths, ignoring any query string. */
function isExcludedPath(url: string): boolean {
  return EXCLUDED_PATHS.some((pattern) => pattern.test(pathOf(url)))
}

/**
 * A successful response on a stream endpoint is an established stream, not an
 * ordinary API response. A refusal before establishment keeps its outcome.
 */
function isEstablishedStream(url: string, status: number): boolean {
  return (
    status >= 200 &&
    status < 300 &&
    STREAM_PATHS.some((pattern) => pattern.test(pathOf(url)))
  )
}

/** Fixed route categories for responses that no registered route pattern matched. */
const UNMATCHED = "unmatched"
const EARLY_REJECTION = "early_rejection"
const UNROUTED = "unrouted"

/** The request object Node emits, once Express has decorated it. */
type RoutedRequest = IncomingMessage & { route?: { path?: unknown } }

/**
 * Express's documented `req.route` holds the last registered route pattern that
 * matched, so the value set is bounded by the application's own registrations.
 * Method-less middleware (`app.use`: publishable key, namespace authentication,
 * body parsing, CORS) finishes before any route matches and uses a fixed
 * category: 404 is unmatched, other refusals are early rejections and a
 * successful response, such as a CORS preflight, is unrouted.
 */
function routeLabel(request: RoutedRequest, status: number): string {
  const path = request.route?.path
  if (typeof path === "string" || path instanceof RegExp) return String(path)
  if (status === 404) return UNMATCHED
  return status >= 400 ? EARLY_REJECTION : UNROUTED
}

/**
 * Seconds. Subsecond resolution, the agreed two-second browsing/status and
 * five-second Order-submission exercise boundaries, one bucket above five
 * seconds and the implicit +Inf overflow.
 */
const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10,
]

/** Owns an isolated registry, diagnostic subscription and private exporter. */
export function startRequestMetrics({
  host,
  port,
  apiPort,
  warn,
}: {
  host: string
  port: number
  apiPort: number
  warn: () => void
}): () => void {
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(apiPort) ||
    apiPort < 1 ||
    apiPort > 65535 ||
    port === apiPort
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid metrics listener configuration",
    )

  const registry = new Registry()
  // The client's standard process collectors, read from this HTTP-serving
  // process on each scrape: CPU seconds, resident/heap bytes and event-loop
  // delay statistics reset at every scrape. The client offers no teardown for its
  // event-loop monitor, GC observer and utilization timer; they do not hold
  // the process open, and clearing the registry hides their series.
  collectDefaultMetrics({ register: registry })
  const completed = new Counter({
    name: "mtogo_http_requests_total",
    help: "Completed ordinary backend API responses by matched route pattern or fixed fallback",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  })
  // A baseline lets the first successful read be visible to increase(), provided
  // Prometheus has scraped before the request. Other outcomes appear on use.
  completed.inc({ method: "GET", route: "/store/products", status: "200" }, 0)
  const duration = new Histogram({
    name: "mtogo_http_request_duration_seconds",
    help: "Server-side duration of completed ordinary backend API responses, from request start to response finish",
    labelNames: ["method", "route"] as const,
    buckets: DURATION_BUCKETS_SECONDS,
    registers: [registry],
  })
  // A zero baseline separates "no duration observations" from a missing series.
  duration.zero({ method: "GET", route: "/store/products" })

  let isStopped = false
  const pending = new Set<() => void>()
  const observe = (message: unknown) => {
    const { request, response } = message as RequestStart
    // Diagnostics channels are process-wide. Never measure the exporter or an
    // unrelated listener, even when it serves a product-shaped URL.
    if (request.socket.localPort !== apiPort) return
    // Read before routing: Express may rewrite request.url while dispatching.
    const url = request.url || ""
    if (isExcludedPath(url)) return
    const startedAt = process.hrtime.bigint()
    const method = ALLOWED_HTTP_METHODS.has(request.method || "")
      ? request.method!
      : "OTHER"
    const cleanup = () => {
      response.off("finish", finish)
      response.off("close", cleanup)
      pending.delete(cleanup)
    }
    const finish = () => {
      cleanup()
      if (isStopped) return
      const status = response.statusCode
      if (isEstablishedStream(url, status)) return
      // Express decorates the same request object Node handed to the channel.
      const route = routeLabel(request as RoutedRequest, status)
      completed.inc({ method, route, status: String(status) })
      duration.observe(
        { method, route },
        Number(process.hrtime.bigint() - startedAt) / 1e9,
      )
    }
    pending.add(cleanup)
    response.once("finish", finish)
    response.once("close", cleanup)
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
    unsubscribe("http.server.request.start", observe)
    for (const cleanup of pending) cleanup()
    exporter.close()
    exporter.closeAllConnections()
    process.off("SIGTERM", stop)
    process.off("SIGINT", stop)
    registry.clear()
  }
  exporter.on("error", () => {
    stop()
    warn()
  })
  subscribe("http.server.request.start", observe)
  process.once("SIGTERM", stop)
  process.once("SIGINT", stop)
  try {
    exporter.listen(port, host)
    exporter.unref()
  } catch {
    stop()
    warn()
  }
  return stop
}
