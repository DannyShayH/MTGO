const { test } = require("node:test")
const assert = require("node:assert/strict")
const { PassThrough } = require("node:stream")
const {
  createApplicationLogger,
  createLogRecord,
  httpStatus,
} = require("../index.cjs")

test("records the demo outcome with a separate success status", () => {
  const record = createLogRecord("backend", "monitoring.demo_read.succeeded", {
    method: "GET",
    route: "/store/products",
    status: 200,
    token: "synthetic-secret",
  })
  assert.equal(record.event, "monitoring.demo_read.succeeded")
  assert.equal(record.level, "info")
  assert.equal(record.status, 200)
  assert.equal(record.msg, "Disposable backend product read completed")
  assert.equal(record.route, "/store/products")
  assert.equal(record.method, "GET")
  assert.doesNotMatch(JSON.stringify(record), /synthetic-secret/)
  assert.equal(httpStatus({ status: 200 }), undefined)
})

test("emits a safe sign-in record and excludes secrets even inside allowed fields", () => {
  const output = new PassThrough()
  let emitted = ""
  output.on("data", (chunk) => {
    emitted += chunk
  })
  const logger = createApplicationLogger("partner", {
    env: "production",
    stream: output,
  })
  logger("auth.sign_in.failed", {
    request_id: "login-28",
    status: 401,
    route: "/auth/restaurant_staff/emailpass",
    method: "POST",
    password: "secret-password",
    email: "secret@example.test",
    token: "secret-token",
    cookie: "secret-cookie",
    headers: { authorization: "secret-authorization" },
    err: new Error("secret-error"),
    actor_id: { email: "nested-secret" },
    msg: "secret-message",
    service: "secret-service",
  })
  const record = JSON.parse(emitted)
  assert.equal(record.level, "warn")
  assert.equal(record.service, "partner")
  assert.equal(record.env, "production")
  assert.equal(record.event, "auth.sign_in.failed")
  assert.equal(record.msg, "Partner sign-in failed")
  assert.equal(record.request_id, "login-28")
  assert.equal(record.status, 401)
  assert.match(record.time, /^\d{4}-\d{2}-\d{2}T/)
  assert.doesNotMatch(emitted, /secret|nested/)
  assert.equal(record.err, undefined)
  logger.close()
})

test("replaces malformed IDs including multiline input and length boundaries", () => {
  const { requestId } = require("../index.cjs")
  for (const value of [
    undefined,
    "",
    "x".repeat(65),
    "first\nforged",
    "bad_value",
    ["one", "two"],
  ]) {
    assert.match(requestId(value), /^[0-9a-f-]{36}$/)
  }
  assert.equal(requestId("a"), "a")
  assert.equal(requestId("x".repeat(64)), "x".repeat(64))
})

test("unexpected errors preserve classification but never their text or attached data", () => {
  const output = new PassThrough()
  let emitted = ""
  output.on("data", (chunk) => {
    emitted += chunk
  })
  const logger = createApplicationLogger("storefront", {
    env: "production",
    stream: output,
  })
  logger("request.failed", {
    status: 503,
    err: Object.assign(new TypeError("secret-email@example.test"), {
      token: "secret-token",
    }),
  })
  const record = JSON.parse(emitted)
  assert.deepEqual(record.err, { type: "TypeError" })
  assert.equal(record.level, "error")
  assert.equal(record.status, 503)
  assert.doesNotMatch(emitted, /secret/)
  logger.close()
})

test("records a missing Restaurant pickup location without sensitive data", () => {
  const record = createLogRecord("backend", "pickup_location_missing", {
    order_id: "order_01",
    restaurant_id: "restaurant_01",
    address: "secret-address",
  })

  assert.equal(record.level, "error")
  assert.equal(record.event, "pickup_location_missing")
  assert.equal(record.msg, "Restaurant pickup location is missing")
  assert.equal(record.order_id, "order_01")
  assert.equal(record.restaurant_id, "restaurant_01")
  assert.equal(record.address, undefined)
})

test("records a refund attempt with only the Order, actor and outcome class", () => {
  const record = createLogRecord("backend", "refund.attempted", {
    order_id: "order_01",
    actor_type: "system",
    actor_id: "system",
    outcome: "failed",
    amount: "149.00",
    err: new Error("mock provider declined: secret-detail"),
  })

  assert.equal(record.level, "info")
  assert.equal(record.event, "refund.attempted")
  assert.equal(record.msg, "Refund attempted")
  assert.equal(record.order_id, "order_01")
  assert.equal(record.actor_type, "system")
  assert.equal(record.actor_id, "system")
  assert.equal(record.outcome, "failed")
  assert.equal(record.amount, undefined)
  assert.equal(record.err, undefined)
  assert.doesNotMatch(JSON.stringify(record), /secret-detail/)
})

test("keeps only a known outcome class", () => {
  for (const outcome of ["succeeded", "failed", "in_progress"])
    assert.equal(
      createLogRecord("backend", "refund.attempted", { outcome }).outcome,
      outcome,
    )
  for (const outcome of ["declined by provider", "pending", 1, "FAILED"])
    assert.equal(
      createLogRecord("backend", "refund.attempted", { outcome }).outcome,
      undefined,
    )
  assert.equal(
    createLogRecord("backend", "request.failed", { outcome: "failed" }).outcome,
    undefined,
  )
})

test("rejects a trailing newline rather than accepting it as an end anchor", () => {
  const { requestId } = require("../index.cjs")
  assert.match(requestId("login-28\n"), /^[0-9a-f-]{36}$/)
})

test("records a slow menu read with only whole-millisecond part times and counts", () => {
  const record = createLogRecord("backend", "menu.read.slow", {
    whole_read_ms: 1700,
    restaurant_ms: 200,
    dish_prices_ms: 1500,
    photos_ms: 0,
    photo_urls_ms: 2,
    food_information_ms: 3,
    dishes: 12,
    photos: 9,
    restaurant_id: "res_01",
    url: "/store/restaurants/res_01/menu?secret=1",
  })

  assert.equal(record.level, "warn")
  assert.equal(record.event, "menu.read.slow")
  assert.equal(record.msg, "Slow Customer menu read")
  assert.equal(record.whole_read_ms, 1700)
  assert.equal(record.restaurant_ms, 200)
  assert.equal(record.dish_prices_ms, 1500)
  assert.equal(record.photos_ms, 0)
  assert.equal(record.photo_urls_ms, 2)
  assert.equal(record.food_information_ms, 3)
  assert.equal(record.dishes, 12)
  assert.equal(record.photos, 9)
  assert.equal(record.url, undefined)
  assert.doesNotMatch(JSON.stringify(record), /secret/)
})

test("keeps a menu read time or count only as a whole number from 0 up to a day", () => {
  for (const value of [0, 1, 86_400_000])
    assert.equal(
      createLogRecord("backend", "menu.read.slow", { whole_read_ms: value })
        .whole_read_ms,
      value,
    )
  for (const value of [-1, 1.5, 86_400_001, "1700", Number.NaN, Infinity])
    assert.equal(
      createLogRecord("backend", "menu.read.slow", { whole_read_ms: value })
        .whole_read_ms,
      undefined,
    )
  assert.equal(
    createLogRecord("backend", "request.failed", { whole_read_ms: 5 })
      .whole_read_ms,
    undefined,
  )
})

test("records an unavailable metrics exporter with no detail", () => {
  const record = createLogRecord(
    "storefront",
    "monitoring.exporter.unavailable",
    {
      err: new Error("listen EADDRINUSE 127.0.0.1:9465"),
      port: 9465,
    },
  )
  assert.equal(record.level, "warn")
  assert.equal(record.msg, "Metrics exporter unavailable; the app continues")
  assert.equal(record.err, undefined)
  assert.doesNotMatch(JSON.stringify(record), /9465/)
})
