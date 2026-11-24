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
