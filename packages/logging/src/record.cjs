// No Node built-ins and no Winston: Edge code builds records from this too.
const { requestId } = require("./request-id.cjs")

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
  "order.placed": ["info", "Order placed"],
  "order.accepted": ["info", "Order accepted"],
  "order.preparation_started": ["info", "Order preparation started"],
  "order.ready": ["info", "Order ready"],
  "order.cancelled": ["info", "Order cancelled"],
  "delivery.assigned": ["info", "Delivery assigned"],
  "delivery.picked_up": ["info", "Delivery picked up"],
  "delivery.handed_over": ["info", "Delivery handed over"],
}

/** Business milestones (#247): they never carry a Customer's ID. */
const isMilestone = (event) => /^(?:order|delivery)\./.test(event)

/** `order.cancelled` only: why, never the free-text reason. */
const CANCELLATION_CATEGORIES = [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
  "unassigned_timeout",
  "operator_cancelled",
]

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

/**
 * A refusal's stable code (#252), such as `checkout_review_incomplete`:
 * lower-case words joined by underscores, so free text never fits.
 */
const REFUSAL_CODE = /^[a-z][a-z0-9_]{1,63}$/

/** A refund attempt's outcome class, never the provider's own words. */
const REFUND_ATTEMPT_OUTCOMES = ["succeeded", "failed", "in_progress"]

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
  const isCustomerMilestone =
    isMilestone(event) && fields.actor_type === "customer"
  for (const field of ["actor_type", "actor_id", "restaurant_id", "order_id"]) {
    if (field === "actor_id" && isCustomerMilestone) continue
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
  if (
    event === "order.cancelled" &&
    CANCELLATION_CATEGORIES.includes(fields.category)
  )
    record.category = fields.category
  if (event === "menu.read.slow")
    for (const field of MENU_READ_FIELDS)
      if (
        Number.isInteger(fields[field]) &&
        fields[field] >= 0 &&
        fields[field] <= MAX_MENU_READ_VALUE
      )
        record[field] = fields[field]
  if (
    event === "input.rejected" &&
    typeof fields.code === "string" &&
    REFUSAL_CODE.test(fields.code)
  )
    record.code = fields.code
  if (event === "request.failed") record.err = safeError(fields.err)
  return record
}

/** The event vocabulary, for consumers that must recognize these records. */
const logEvents = Object.freeze(Object.keys(events))

module.exports = { logEvents, createLogRecord, safeError, statusInRange }
