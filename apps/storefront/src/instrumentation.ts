import type { Instrumentation } from "next"

/**
 * Next.js calls this once when the server starts. With
 * `MTOGO_METRICS_ENABLED=1` it opens the private page render exporter
 * (#202) in the Node.js server; it is off by default, and a failure never
 * stops the storefront. See src/lib/observability/README.md.
 */
export async function register() {
  // The imports stay inside this check so the Edge bundle never includes them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.MTOGO_METRICS_ENABLED !== "1") return
    // The app logger module is marked server-only, which this hook cannot
    // import; it is built from the same shared logger.
    const { createApplicationLogger } = await import("@dtc/logging")
    const log = createApplicationLogger("storefront")
    const warn = () => log("monitoring.exporter.unavailable")
    try {
      const { startPageRenderMetrics } =
        await import("./lib/observability/page-render-metrics")
      startPageRenderMetrics({
        host: process.env.MTOGO_METRICS_HOST || "127.0.0.1",
        port: Number(process.env.MTOGO_METRICS_PORT || 9465),
        appPort: Number(process.env.PORT || 8000),
        warn,
      })
    } catch {
      warn()
    }
  }
}

let logRequestError: Instrumentation.onRequestError | undefined

/**
 * Next.js calls this for every server error it captures: a page, route
 * handler, Server Action or the middleware (#247). Only the error's safe class,
 * the route pattern, the method and a validated request ID are logged, once
 * per request.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // src/lib/logger.ts is server-only, which this hook cannot import. Each
  // import stays inside its check, so the Edge bundle never includes Winston.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createRequestErrorLogger } = await import("@dtc/logging")
    logRequestError ??= createRequestErrorLogger("storefront")
  } else {
    const { createEdgeRequestErrorLogger } = await import("@dtc/logging/edge")
    logRequestError ??= createEdgeRequestErrorLogger("storefront")
  }
  await logRequestError(error, request, context)
}
