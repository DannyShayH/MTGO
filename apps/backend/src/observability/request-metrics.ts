import { subscribe, unsubscribe } from "node:diagnostics_channel"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { Counter, Registry } from "@prometheus-io/client"
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

/** Deliberately limited coverage until the wider API collection slice. */
function productRoute(url: string): string | undefined {
  const path = url.split("?")[0]
  if (/^\/store\/products\/?$/i.test(path)) return "/store/products"
  if (/^\/store\/products\/[^/]+\/?$/i.test(path)) return "/store/products/:id"
  return undefined
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
  const completed = new Counter({
    name: "mtogo_http_requests_total",
    help: "Completed backend product API responses; initial limited route coverage",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  })
  // A baseline lets the first successful read be visible to increase(), provided
  // Prometheus has scraped before the request. Other outcomes appear on use.
  completed.inc({ method: "GET", route: "/store/products", status: "200" }, 0)

  let isStopped = false
  const pending = new Set<() => void>()
  const observe = (message: unknown) => {
    const { request, response } = message as RequestStart
    // Diagnostics channels are process-wide. Never measure the exporter or an
    // unrelated listener, even when it serves a product-shaped URL.
    if (request.socket.localPort !== apiPort) return
    const route = productRoute(request.url || "")
    if (!route) return
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
      completed.inc({ method, route, status: String(response.statusCode) })
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
