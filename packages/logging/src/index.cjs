const winston = require("winston")
const {
  logEvents,
  createLogRecord,
  safeError,
  statusInRange,
} = require("./record.cjs")
const { requestErrorFields } = require("./request-error.cjs")
const { requestId } = require("./request-id.cjs")

function httpStatus(error) {
  if (!error || typeof error !== "object") return undefined
  return statusInRange(error.status ?? error.response?.status, 400)
}

function createApplicationLogger(
  service,
  { env = process.env.NODE_ENV || "development", stream } = {},
) {
  const logger = winston.createLogger({
    level: env === "development" ? "debug" : "info",
    format:
      env === "development"
        ? winston.format.printf(
            (record) =>
              `${record.time} ${record.level} ${record.service} ${record.event} ${JSON.stringify(record)}`,
          )
        : winston.format.json(),
    transports: [
      stream
        ? new winston.transports.Stream({ stream })
        : new winston.transports.Console(),
    ],
  })
  const log = (event, fields) =>
    logger.log(createLogRecord(service, event, fields, env))
  log.close = () => logger.close()
  return log
}

/**
 * A Next.js `onRequestError` logger: one safe `request.failed` record per
 * request. Next.js reports every place a request fails in, such as a page's
 * metadata, its content and its error page, with the same headers object.
 */
function createRequestErrorLogger(service, options) {
  const log = createApplicationLogger(service, options)
  const recorded = new WeakSet()
  return (error, request, context) => {
    const headers = request?.headers
    if (headers) {
      if (recorded.has(headers)) return
      recorded.add(headers)
    }
    log("request.failed", requestErrorFields(error, request, context))
  }
}

module.exports = {
  logEvents,
  createApplicationLogger,
  createLogRecord,
  requestId,
  createRequestErrorLogger,
  httpStatus,
  safeError,
}
