import { once } from "node:events"
import { createServer, request, Server } from "node:http"
import { startRequestMetrics } from "../request-metrics"

async function listen(server: Server) {
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return (server.address() as { port: number }).port
}

async function freePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

const portCases = [
  { value: NaN, valid: false, reason: "EP: not a number" },
  { value: Infinity, valid: false, reason: "EP: non-finite value" },
  { value: -1, valid: false, reason: "EP: negative integer" },
  { value: 0, valid: false, reason: "BVA: below the minimum port" },
  { value: 1, valid: true, reason: "BVA: minimum port" },
  { value: 2, valid: true, reason: "BVA: above the minimum port" },
  { value: 9464.5, valid: false, reason: "EP: fractional value" },
  { value: 65534, valid: true, reason: "BVA: below the maximum port" },
  { value: 65535, valid: true, reason: "BVA: maximum port" },
  { value: 65536, valid: false, reason: "BVA: above the maximum port" },
]

describe("request metrics listener configuration", () => {
  it.each([
    ...["port", "apiPort"].flatMap((field) =>
      portCases.map(({ value, valid, reason }) => ({
        port: 9464,
        apiPort: 9000,
        [field]: value,
        valid,
        reason: `${field}: ${reason}`,
      })),
    ),
    {
      port: 9464,
      apiPort: 9464,
      valid: false,
      reason: "DT: individually valid ports must use different listeners",
    },
  ])("$reason", ({ port, apiPort, valid }) => {
    // Keep validation real while avoiding privileged or occupied boundary ports.
    const bind = jest
      .spyOn(Server.prototype, "listen")
      .mockImplementation(function () {
        return this
      })
    let stop: (() => void) | undefined
    const start = () => {
      stop = startRequestMetrics({
        host: "127.0.0.1",
        port,
        apiPort,
        warn: jest.fn(),
      })
    }
    try {
      if (valid) {
        expect(start).not.toThrow()
        expect(bind).toHaveBeenCalledWith(port, "127.0.0.1")
      } else {
        expect(start).toThrow("Invalid metrics listener configuration")
        expect(bind).not.toHaveBeenCalled()
      }
    } finally {
      stop?.()
      bind.mockRestore()
    }
  })
})

describe("private request metrics HTTP boundary", () => {
  let app: Server
  let apiPort: number
  let port: number
  let stop: () => void
  const warn = jest.fn()

  beforeEach(async () => {
    app = createServer((req, res) => {
      // Mirrors Express's documented decoration of the same request object.
      const route = req.headers["test-route"]
      if (route === "regexp") Object.assign(req, { route: { path: /^\/x$/ } })
      else if (route) Object.assign(req, { route: { path: route } })
      if (req.url === "/store/products/interrupted") {
        res.writeHead(200)
        res.write("partial")
        return
      }
      // The final status can differ from an earlier handler's tentative status.
      res.statusCode = 200
      res.writeHead(Number(req.headers["test-status"] || 200)).end("synthetic")
    })
    apiPort = await listen(app)
    port = await freePort()
    warn.mockClear()
    stop = startRequestMetrics({ host: "127.0.0.1", port, apiPort, warn })
  })

  afterEach(async () => {
    stop()
    app.closeAllConnections()
    await new Promise<void>((resolve) => app.close(() => resolve()))
  })

  const scrape = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/metrics`)
    expect(response.headers.get("content-type")).toContain("text/plain")
    expect(response.status).toBe(200)
    return response.text()
  }

  it.each([
    { status: 200, reason: "EP: completed read" },
    { status: 401, reason: "EP: rejected read uses final status" },
    { status: 500, reason: "EP: server failure uses final status" },
  ])("$reason", async ({ status }) => {
    await scrape()
    await fetch(`http://127.0.0.1:${apiPort}/store/products?secret=discard`, {
      headers: {
        "test-status": String(status),
        "test-route": "/store/products",
      },
    })
    const metrics = await scrape()
    expect(metrics).toContain(
      `mtogo_http_requests_total{method="GET",route="/store/products",status="${status}"} 1`,
    )
    expect(metrics).not.toContain("secret")
    expect(await scrape()).toBe(metrics)
  })

  it("aggregates different IDs into one product detail series", async () => {
    await scrape()
    for (const path of [
      "/store/products/secret-one?q=secret-query",
      "/store/products/secret-two",
    ])
      await fetch(`http://127.0.0.1:${apiPort}${path}`, {
        headers: { "test-route": "/store/products/:id" },
      })
    const metrics = await scrape()
    expect(metrics).toContain(
      'method="GET",route="/store/products/:id",status="200"} 2',
    )
    expect(metrics).not.toContain("secret")
  })

  it.each([
    {
      path: "/store/products?secret=query",
      method: "GET",
      route: "/store/products",
      expectedLabels: 'method="GET",route="/store/products",status="200"',
      reason: "EP: query strings are discarded from a matched pattern",
    },
    {
      path: "/store/products",
      method: "POST",
      route: "/store/products",
      expectedLabels: 'method="POST",route="/store/products",status="200"',
      reason: "EP: an allowed method keeps its label",
    },
    {
      path: "/store/products",
      method: "PROPFIND",
      route: "/store/products",
      expectedLabels: 'method="OTHER",route="/store/products",status="200"',
      reason: "EP: methods outside the allowlist are grouped",
    },
    {
      path: "/x",
      method: "GET",
      route: "regexp",
      expectedLabels: 'method="GET",route="/^\\\\/x$/",status="200"',
      reason: "EP: a registered regular-expression matcher is a bounded label",
    },
    {
      path: "/store/unknown-secret",
      method: "GET",
      status: 404,
      expectedLabels: 'method="GET",route="unmatched",status="404"',
      reason: "EP: no matched route and 404 is the unmatched category",
    },
    {
      path: "/store/products?secret=missing-key",
      method: "GET",
      status: 400,
      expectedLabels: 'method="GET",route="early_rejection",status="400"',
      reason: "EP: a refusal before any route match is an early rejection",
    },
    {
      path: "/store/products",
      method: "OPTIONS",
      status: 204,
      expectedLabels: 'method="OPTIONS",route="unrouted",status="204"',
      reason: "EP: a successful response with no matched route is unrouted",
    },
    {
      path: "/store/redirect-secret",
      method: "GET",
      status: 399,
      expectedLabels: 'method="GET",route="unrouted",status="399"',
      reason: "BVA: below the refusal boundary is still unrouted",
    },
    {
      path: "/store/products?secret=forbidden",
      method: "GET",
      status: 403,
      expectedLabels: 'method="GET",route="early_rejection",status="403"',
      reason: "EP: a non-404 refusal before any route match is early",
    },
    {
      path: "/store/products?secret=refused",
      method: "GET",
      status: 400,
      expectedLabels: 'method="GET",route="early_rejection",status="400"',
      reason: "BVA: the refusal boundary is an early rejection",
    },
    {
      path: "/partner/orders/stream",
      method: "GET",
      route: "/partner/orders/stream",
      status: 300,
      expectedLabels:
        'method="GET",route="/partner/orders/stream",status="300"',
      reason: "BVA: above the successful range is not an established stream",
    },
    {
      path: "/partner/orders/stream",
      method: "GET",
      route: "/partner/orders/stream",
      status: 299,
      reason: "BVA: the top of the successful range is an established stream",
    },
    {
      path: "/partner/orders/stream",
      method: "GET",
      status: 401,
      expectedLabels: 'method="GET",route="early_rejection",status="401"',
      reason: "EP: a stream refused before establishment keeps its outcome",
    },
    {
      path: "/partner/orders/stream?secret=1",
      method: "GET",
      route: "/partner/orders/stream",
      reason: "EP: an established stream is excluded",
    },
    {
      path: "/health",
      method: "GET",
      reason: "EP: health traffic is excluded",
    },
    {
      path: "/app",
      method: "GET",
      reason: "EP: the Admin entry page is excluded",
    },
    {
      path: "/app/assets/secret.js",
      method: "GET",
      reason: "EP: Admin assets are excluded",
    },
    {
      path: "/static/secret.jpg",
      method: "GET",
      reason: "EP: static traffic is excluded",
    },
    {
      path: "/metrics",
      method: "GET",
      reason: "EP: API metrics path is excluded",
    },
  ])("$reason", async ({ path, method, route, status, expectedLabels }) => {
    const baseline = await scrape()
    const headers: Record<string, string> = {
      "test-status": String(status ?? 200),
    }
    if (route) headers["test-route"] = route
    await new Promise<void>((resolve, reject) => {
      request(
        `http://127.0.0.1:${apiPort}${path}`,
        { method, headers },
        (res) => {
          res.resume()
          res.on("end", resolve)
        },
      )
        .on("error", reject)
        .end()
    })
    const metrics = await scrape()
    if (expectedLabels) expect(metrics).toContain(`{${expectedLabels}} 1`)
    else expect(metrics).toBe(baseline)
    expect(metrics).not.toMatch(/secret|PROPFIND/)
  })

  it("excludes a product-shaped request to the exporter listener", async () => {
    const baseline = await scrape()
    await fetch(`http://127.0.0.1:${port}/store/products`)
    expect(await scrape()).toBe(baseline)
  })

  it("does not turn an interrupted response into a completed status", async () => {
    await scrape()
    await new Promise<void>((resolve, reject) => {
      request(
        `http://127.0.0.1:${apiPort}/store/products/interrupted`,
        (res) => {
          res.once("data", () => {
            res.destroy()
            resolve()
          })
        },
      )
        .on("error", reject)
        .end()
    })
    expect(await scrape()).not.toMatch(/status="200"} 1/)
  })

  it("releases its listener and subscription on repeated disposal", async () => {
    await scrape()
    stop()
    stop()
    stop = startRequestMetrics({ host: "127.0.0.1", port, apiPort, warn })
    await fetch(`http://127.0.0.1:${apiPort}/store/products`)
    expect(await scrape()).toContain('status="200"} 1')
    expect(warn).not.toHaveBeenCalled()
  })

  it("keeps application requests usable when the exporter cannot bind", async () => {
    await scrape()
    const failed = startRequestMetrics({
      host: "127.0.0.1",
      port,
      apiPort,
      warn,
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(
      (await fetch(`http://127.0.0.1:${apiPort}/store/products`)).status,
    ).toBe(200)
    expect(await scrape()).toContain('status="200"} 1')
    failed()
  })
})
