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
}

/** IDs are correlation labels, never credentials or a source of authority. */
function requestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value)
    ? value
    : randomUUID()
}

function httpStatus(error) {
  if (!error || typeof error !== "object") return undefined
  const status = error.status ?? error.response?.status
  return Number.isInteger(status) && status >= 400 && status <= 599
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
  const status = httpStatus({ status: fields.status })
  const level =
    event === "upstream.request.failed" && (!status || status >= 500)
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
