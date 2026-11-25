const { test } = require("node:test")
const assert = require("node:assert/strict")
const { PassThrough } = require("node:stream")
const { createLogRecord, createRequestErrorLogger } = require("../index.cjs")
const { requestId, knownRequestId } = require("../request-id.cjs")

// Decided in #247 step 4: the agreed milestone events and their sentences.
const milestones = [
  ["order.placed", "Order placed"],
  ["order.accepted", "Order accepted"],
  ["order.preparation_started", "Order preparation started"],
  ["order.ready", "Order ready"],
  ["order.cancelled", "Order cancelled"],
  ["delivery.assigned", "Delivery assigned"],
  ["delivery.picked_up", "Delivery picked up"],
  ["delivery.handed_over", "Delivery handed over"],
]
for (const [event, msg] of milestones)
  test(`${event} is an info milestone with only opaque references`, () => {
    const { time, ...record } = createLogRecord(
      "backend",
      event,
      {
        order_id: "order_01",
        restaurant_id: "rest_01",
        actor_type: "restaurant_staff",
        actor_id: "rstf_01",
        note: "secret-note",
        email: "secret@example.test",
        outcome: "succeeded",
      },
      "production",
    )
    assert.match(time, /Z$/)
    assert.deepEqual(record, {
      level: "info",
      service: "backend",
      env: "production",
      event,
      msg,
      order_id: "order_01",
      restaurant_id: "rest_01",
      actor_type: "restaurant_staff",
      actor_id: "rstf_01",
    })
  })

for (const category of [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
  "unassigned_timeout",
  "operator_cancelled",
])
  test(`EP: order.cancelled keeps the category ${category}`, () => {
    assert.equal(
      createLogRecord("backend", "order.cancelled", { category }).category,
      category,
    )
  })

for (const [reason, event, category] of [
  ["free text", "order.cancelled", "the customer was rude"],
  ["non-scalar", "order.cancelled", { note: "secret" }],
  ["another event", "order.accepted", "restaurant_rejected"],
])
  test(`EP: ${reason} is never kept as a category`, () => {
    assert.equal(
      "category" in createLogRecord("backend", event, { category }),
      false,
    )
  })

const errorLogger = () => {
  const stream = new PassThrough()
  let emitted = ""
  stream.on("data", (chunk) => {
    emitted += chunk
  })
  const logError = createRequestErrorLogger("storefront", {
    env: "production",
    stream,
  })
  return { logError, output: () => emitted }
}
const emit = (error, request, context) => {
  const { logError, output } = errorLogger()
  logError(error, request, context)
  return output()
}
const request = {
  path: "/dk/orders/order_secret?token=secret-token",
  method: "GET",
  headers: {
    "x-request-id": "page-247",
    cookie: "secret-cookie",
    authorization: "Bearer secret-authorization",
  },
}

test("a Next.js server error becomes one safe request.failed record", () => {
  const error = Object.assign(new TypeError("secret-message"), {
    digest: "secret-digest",
    cause: new Error("secret-cause"),
  })
  const line = emit(error, request, {
    routePath: "/[countryCode]/(main)/orders/[id]/page",
    routeType: "render",
  })
  const { time, ...record } = JSON.parse(line)
  assert.match(time, /Z$/)
  assert.deepEqual(record, {
    level: "error",
    service: "storefront",
    env: "production",
    event: "request.failed",
    msg: "Request failed",
    request_id: "page-247",
    route: "/:countryCode/orders/:id",
    method: "GET",
    err: { type: "TypeError" },
  })
  assert.doesNotMatch(line, /secret/)
})

for (const [reason, routePath, route] of [
  ["route handler", "/api/payment-return/route", "/api/payment-return"],
  ["root page", "/page", "/"],
  ["catch-all", "/[countryCode]/[...slug]/page", "/:countryCode/:slug*"],
  ["optional catch-all", "/[[...path]]/page", "/:path*"],
  ["parallel slot", "/(main)/account/@dashboard/page", "/account"],
  ["absent", undefined, undefined],
  ["not a path", "secret text", undefined],
])
  test(`EP: ${reason} route file path gives the pattern ${route}`, () => {
    const line = emit(new Error("secret"), request, { routePath })
    assert.equal(JSON.parse(line).route, route)
    assert.doesNotMatch(line, /secret/)
  })

// Next.js reports one failed page once for its metadata, its content and its
// error page, with the request's own headers object each time.
test("a request that fails in several places is recorded once", () => {
  const { logError, output } = errorLogger()
  const context = { routePath: "/[countryCode]/products/[handle]/page" }
  for (const place of ["metadata", "page", "error page"])
    logError(new Error(place), { ...request }, context)
  assert.equal(output().trim().split("\n").length, 1)
})

test("another request with the same ID is recorded too", () => {
  const { logError, output } = errorLogger()
  const context = { routePath: "/page" }
  for (let sent = 0; sent < 2; sent++)
    logError(
      new Error("x"),
      { method: "GET", headers: { "x-request-id": "same" } },
      context,
    )
  assert.equal(output().trim().split("\n").length, 2)
})

test("a call without a request is still recorded, and never throws", () => {
  assert.equal(
    JSON.parse(emit(new Error("secret"), undefined, undefined)).event,
    "request.failed",
  )
})

for (const [reason, id] of [
  ["missing", undefined],
  ["invalid characters", "bad id"],
  ["repeated header", ["one", "two"]],
])
  test(`EP: a ${reason} request ID is left out, never invented`, () => {
    const line = emit(
      new Error("x"),
      { method: "GET", headers: { "x-request-id": id } },
      { routePath: "/page" },
    )
    assert.equal("request_id" in JSON.parse(line), false)
  })

for (const [reason, value, kept] of [
  ["BVA: one character", "a", true],
  ["BVA: 64 characters", "x".repeat(64), true],
  ["BVA: 65 characters", "x".repeat(65), false],
  ["BVA: empty", "", false],
  ["EP: newline", "a\nb", false],
])
  test(`${reason} as a request ID`, () => {
    assert.equal(knownRequestId(value), kept ? value : undefined)
    if (kept) assert.equal(requestId(value), value)
    else assert.match(requestId(value), /^[0-9a-f-]{36}$/)
  })

test("a milestone names a Customer actor by type only", () => {
  const record = createLogRecord("backend", "order.cancelled", {
    actor_type: "customer",
    actor_id: "cus_secret",
  })
  assert.equal(record.actor_type, "customer")
  assert.equal("actor_id" in record, false)
})

test("refund.attempted still names the Customer who attempted it", () => {
  assert.equal(
    createLogRecord("backend", "refund.attempted", {
      actor_type: "customer",
      actor_id: "cus_01",
    }).actor_id,
    "cus_01",
  )
})
