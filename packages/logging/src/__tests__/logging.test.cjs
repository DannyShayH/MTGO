const { test } = require("node:test")
const assert = require("node:assert/strict")
const { PassThrough } = require("node:stream")
const { createApplicationLogger } = require("../index.cjs")

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

test("rejects a trailing newline rather than accepting it as an end anchor", () => {
  const { requestId } = require("../index.cjs")
  assert.match(requestId("login-28\n"), /^[0-9a-f-]{36}$/)
})
