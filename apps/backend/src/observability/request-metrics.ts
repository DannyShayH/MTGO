import { subscribe, unsubscribe } from "node:diagnostics_channel"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "@prometheus-io/client"
import { MedusaError } from "@medusajs/framework/utils"
import { DURATION_BUCKETS_SECONDS } from "./duration-buckets"
import { registerMenuReadMetrics } from "./menu-read-timing"

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

/**
 * Server-sent event endpoints and the bounded route category their established
 * streams are measured under, apart from ordinary API responses.
 */
const STREAM_ROUTES = [
  {
    pattern: /^\/partner\/orders\/stream\/?$/i,
    route: "/partner/orders/stream",
  },
  {
    // The Delivery agent feed (#165).
    pattern: /^\/partner\/deliveries\/stream\/?$/i,
    route: "/partner/deliveries/stream",
  },
]

const pathOf = (url: string) => url.split("?")[0]

/** Health, scrape, Admin and static paths, ignoring any query string. */
function isExcludedPath(url: string): boolean {
  return EXCLUDED_PATHS.some((pattern) => pattern.test(pathOf(url)))
}

/** The stream route category of a raw URL, or undefined for ordinary paths. */
function streamRouteOf(url: string): string | undefined {
  return STREAM_ROUTES.find(({ pattern }) => pattern.test(pathOf(url)))?.route
}

/**
 * A stream endpoint whose successful headers have been sent is an established
 * stream, not an ordinary API response. A refusal before establishment, or a
 * disconnect before any headers, keeps its ordinary outcome.
 */
function isEstablished(response: ServerResponse): boolean {
  return (
    response.headersSent &&
    response.statusCode >= 200 &&
    response.statusCode < 300
  )
}

/** Why an established stream ended. A disconnect is not an application error. */
type StreamOutcome = "server_ended" | "disconnected"
const STREAM_OUTCOMES: StreamOutcome[] = ["server_ended", "disconnected"]

/** Fixed route categories for responses that no registered route pattern matched. */
const UNMATCHED = "unmatched"
const EARLY_REJECTION = "early_rejection"
const UNROUTED = "unrouted"

/** The request object Node emits, once Express has decorated it. */
type RoutedRequest = IncomingMessage & { route?: { path?: unknown } }

/** Express's documented `req.route` pattern, when a route has matched. */
function matchedRoute(request: RoutedRequest): string | undefined {
  const path = request.route?.path
  if (typeof path === "string" || path instanceof RegExp) return String(path)
  return undefined
}

/**
 * Express's documented `req.route` holds the last registered route pattern that
 * matched, so the value set is bounded by the application's own registrations.
 * Method-less middleware (`app.use`: publishable key, namespace authentication,
 * body parsing, CORS) finishes before any route matches and uses a fixed
 * category: 404 is unmatched, other refusals are early rejections and a
 * successful response, such as a CORS preflight, is unrouted.
 */
function routeLabel(request: RoutedRequest, status: number): string {
  const route = matchedRoute(request)
  if (route) return route
  if (status === 404) return UNMATCHED
  return status >= 400 ? EARLY_REJECTION : UNROUTED
}

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
  const interrupted = new Counter({
    name: "mtogo_http_requests_interrupted_total",
    help: "Ordinary backend API requests whose connection closed before the response completed; no status is recorded",
    labelNames: ["method", "route"] as const,
    registers: [registry],
  })
  // Established streams still open, read from their real responses on scrape.
  const openStreams = new Map<ServerResponse, string>()
  registry.registerMetric(
    new Gauge({
      name: "mtogo_sse_connections_active",
      help: "Established server-sent event connections still open, by stream route",
      labelNames: ["route"] as const,
      // Only this registry: the client's global default registry would make
      // a second start in the same process throw on the duplicate name.
      registers: [],
      collect() {
        for (const { route } of STREAM_ROUTES) this.set({ route }, 0)
        for (const [response, route] of openStreams)
          if (isEstablished(response)) this.inc({ route })
      },
    }),
  )
  const closedStreams = new Counter({
    name: "mtogo_sse_connections_closed_total",
    help: "Established server-sent event connections that ended, by stream route and whether the server ended them or the connection closed",
    labelNames: ["route", "outcome"] as const,
    registers: [registry],
  })
  // Zero baselines: "no streams" and "no interruptions" are observations.
  for (const { route } of STREAM_ROUTES)
    for (const outcome of STREAM_OUTCOMES)
      closedStreams.inc({ route, outcome }, 0)
  interrupted.inc({ method: "GET", route: "/store/products" }, 0)
  interrupted.inc({ method: "GET", route: UNROUTED }, 0)
  registerMenuReadMetrics(registry)

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
    const streamRoute = streamRouteOf(url)
    if (streamRoute) openStreams.set(response, streamRoute)
    const cleanup = () => {
      response.off("finish", settle)
      response.off("close", settle)
      openStreams.delete(response)
      pending.delete(cleanup)
    }
    // Exactly one outcome per request: the first of finish and close settles
    // it and removes the other listener. A close after a completed response
    // (writableFinished) is still that completion, never a second outcome.
    const settle = () => {
      cleanup()
      if (isStopped) return
      const isFinished = response.writableFinished
      if (streamRoute && isEstablished(response)) {
        const outcome: StreamOutcome = isFinished
          ? "server_ended"
          : "disconnected"
        closedStreams.inc({ route: streamRoute, outcome })
        return
      }
      // Express decorates the same request object Node handed to the channel.
      if (!isFinished) {
        // No final status exists; no matched route yet is all it shows.
        const route = matchedRoute(request as RoutedRequest) ?? UNROUTED
        interrupted.inc({ method, route })
        return
      }
      const status = response.statusCode
      const route = routeLabel(request as RoutedRequest, status)
      completed.inc({ method, route, status: String(status) })
      duration.observe(
        { method, route },
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
