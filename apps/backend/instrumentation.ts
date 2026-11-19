import cluster from "node:cluster"
import { configManager } from "@medusajs/framework/config"
import { logger } from "@medusajs/framework/logger"
import { startRequestMetrics } from "./src/observability/request-metrics"

let stop: (() => void) | undefined

const warnExporterUnavailable = () =>
  logger.warn("Request metrics unavailable; API startup continues")

/** Medusa invokes this hook for start/develop, before loading the HTTP app. */
export function register() {
  if (
    stop ||
    process.env.MTOGO_METRICS_ENABLED !== "1" ||
    configManager.config.projectConfig.workerMode === "worker" ||
    cluster.isWorker
  )
    return

  // Monitoring configuration and bind failures must not prevent API startup.
  try {
    stop = startRequestMetrics({
      host: process.env.MTOGO_METRICS_HOST || "127.0.0.1",
      port: Number(process.env.MTOGO_METRICS_PORT || 9464),
      apiPort: Number(process.env.PORT || 9000),
      warn: warnExporterUnavailable,
    })
  } catch {
    warnExporterUnavailable()
  }
  return stop
}
