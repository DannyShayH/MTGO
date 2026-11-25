const { test } = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { createEdgeRequestErrorLogger } = require("../edge.cjs")

const request = {
  path: "/dk/orders/order_secret?token=secret-token",
  method: "GET",
  headers: { "x-request-id": "page-247", cookie: "secret-cookie" },
}

test("a middleware error becomes one safe request.failed line", () => {
  const lines = []
  const logError = createEdgeRequestErrorLogger("storefront", {
    env: "production",
    write: (line) => lines.push(line),
  })
  const error = Object.assign(new TypeError("secret-message"), {
    cause: new Error("secret-cause"),
  })
  logError(error, request, { routePath: "/proxy", routeType: "proxy" })
  assert.equal(lines.length, 1)
  const { time, ...record } = JSON.parse(lines[0])
  assert.match(time, /Z$/)
  assert.deepEqual(record, {
    level: "error",
    service: "storefront",
    env: "production",
    event: "request.failed",
    msg: "Request failed",
    request_id: "page-247",
    route: "/proxy",
    method: "GET",
    err: { type: "TypeError" },
  })
  assert.doesNotMatch(lines[0], /secret/)
})

test("by default the line goes to stdout", (context) => {
  const write = context.mock.method(console, "log", () => {})
  createEdgeRequestErrorLogger("storefront")(new Error("secret"), request, {})
  assert.equal(write.mock.callCount(), 1)
  assert.equal(
    JSON.parse(write.mock.calls[0].arguments[0]).event,
    "request.failed",
  )
})

// The Edge runtime has no Node modules: one import would break the middleware.
test("the Edge entry loads no Winston and no Node built-in", () => {
  const script = `
    const Module = require("node:module")
    const load = Module._load
    Module._load = function (id, ...rest) {
      if (!id.startsWith(".") && !id.startsWith("/")) throw new Error(id)
      return load.call(this, id, ...rest)
    }
    require(${JSON.stringify(require.resolve("../edge.cjs"))})`
  execFileSync(process.execPath, ["-e", script])
})
