const { randomUUID } = require("node:crypto")
const winston = require("winston")

const events = {
  "auth.sign_in.succeeded": ["info", "Partner sign-in succeeded"],
  "auth.sign_in.failed": ["warn", "Partner sign-in failed"],
  "auth.session.ended": ["info", "Partner session ended"],
  "access.denied": ["warn", "Access denied"],
  "input.rejected": ["info", "Input rejected"],
  "upstream.request.failed": ["info", "Upstream request failed"],
  "request.failed": ["error", "Request failed"],
  pickup_location_missing: ["error", "Restaurant pickup location is missing"],
  "refund.attempted": ["info", "Refund attempted"],
  "menu.read.slow": ["warn", "Slow Customer menu read"],
  "monitoring.exporter.unavailable": [
    "warn",
    "Metrics exporter unavailable; the app continues",
  ],
  "monitoring.demo_read.succeeded": [
    "info",
    "Disposable backend product read completed",
  ],
}

/**
 * `menu.read.slow` only: part times in whole milliseconds and dish counts,
 * each a whole number from 0 up to a day's milliseconds.
 */
const MENU_READ_FIELDS = [
  "whole_read_ms",
  "restaurant_ms",
  "dish_prices_ms",
  "photos_ms",
  "photo_urls_ms",
  "food_information_ms",
  "dishes",
  "photos",
]
const MAX_MENU_READ_VALUE = 86_400_000

/** A refund attempt's outcome class, never the provider's own words. */
const REFUND_ATTEMPT_OUTCOMES = ["succeeded", "failed", "in_progress"]

/** IDs are correlation labels, never credentials or a source of authority. */
function requestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value)
    ? value
    : randomUUID()
}

function httpStatus(error) {
  if (!error || typeof error !== "object") return undefined
  return statusInRange(error.status ?? error.response?.status, 400)
}

function statusInRange(status, minimum) {
  return Number.isInteger(status) && status >= minimum && status <= 599
    ? status
    : undefined
}

/** Deliberately discard messages, stacks, causes and custom error properties. */
function safeError(error) {
  const type =
    error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError
        ? "RangeError"
        : "Error"
  return { type }
}

function createLogRecord(
  service,
  event,
  fields = {},
  env = process.env.NODE_ENV,
) {
  if (!Object.hasOwn(events, event))
    throw new Error("Unknown application log event")
  const [defaultLevel, msg] = events[event]
  const status = statusInRange(fields.status, 100)
  const level =
    event === "upstream.request.failed" &&
    (!status || status < 400 || status >= 500)
      ? "warn"
      : defaultLevel
  const record = {
    time: new Date().toISOString(),
    level,
    service,
    env: ["development", "test", "production", "staging"].includes(env)
      ? env
      : "development",
    event,
    msg,
  }
  if (fields.request_id !== undefined)
    record.request_id = requestId(fields.request_id)
  if (status) record.status = status
  for (const field of ["actor_type", "actor_id", "restaurant_id", "order_id"]) {
    if (
      typeof fields[field] === "string" &&
      /^[A-Za-z0-9_-]{1,128}$/.test(fields[field])
    )
      record[field] = fields[field]
  }
  if (
    typeof fields.route === "string" &&
    /^\/[A-Za-z0-9/_:*.-]{0,127}$/.test(fields.route)
  )
    record.route = fields.route
  if (
    ["GET", "POST", "DELETE", "PUT", "PATCH", "HEAD", "OPTIONS"].includes(
      fields.method,
    )
  )
    record.method = fields.method
  if (
    event === "refund.attempted" &&
    REFUND_ATTEMPT_OUTCOMES.includes(fields.outcome)
  )
    record.outcome = fields.outcome
  if (event === "menu.read.slow")
    for (const field of MENU_READ_FIELDS)
      if (
        Number.isInteger(fields[field]) &&
        fields[field] >= 0 &&
        fields[field] <= MAX_MENU_READ_VALUE
      )
        record[field] = fields[field]
  if (event === "request.failed") record.err = safeError(fields.err)
  return record
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

module.exports = {
  createApplicationLogger,
  createLogRecord,
  requestId,
  httpStatus,
  safeError,
}
