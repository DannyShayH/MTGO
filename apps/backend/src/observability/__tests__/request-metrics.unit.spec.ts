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
      headers: { "test-status": String(status) },
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
      await fetch(`http://127.0.0.1:${apiPort}${path}`)
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
      expectedLabels: 'method="GET",route="/store/products"',
      reason: "EP: list query strings are discarded",
    },
    {
      path: "/store/products/secret-id",
      method: "GET",
      expectedLabels: 'method="GET",route="/store/products/:id"',
      reason: "EP: product IDs are replaced by a route parameter",
    },
    {
      path: "/store/products",
      method: "POST",
      expectedLabels: 'method="POST",route="/store/products"',
      reason: "EP: an allowed method keeps its label",
    },
    {
      path: "/store/products",
      method: "PROPFIND",
      expectedLabels: 'method="OTHER",route="/store/products"',
      reason: "EP: methods outside the allowlist are grouped",
    },
    {
      path: "/health",
      method: "GET",
      reason: "EP: health traffic is excluded",
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
    {
      path: "/store/unknown-secret",
      method: "GET",
      reason: "EP: unrelated store routes are excluded",
    },
  ])("$reason", async ({ path, method, expectedLabels }) => {
    const baseline = await scrape()
    await new Promise<void>((resolve, reject) => {
      request(`http://127.0.0.1:${apiPort}${path}`, { method }, (res) => {
        res.resume()
        res.on("end", resolve)
      })
        .on("error", reject)
        .end()
    })
    const metrics = await scrape()
    if (expectedLabels)
      expect(metrics).toContain(`${expectedLabels},status="200"} 1`)
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
    expect(await scrape()).not.toContain('route="/store/products/:id"')
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
