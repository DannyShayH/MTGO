import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer, request, type Server } from "node:http"
import { afterEach, beforeEach, describe, it } from "node:test"
import { startPageRenderMetrics } from "../page-render-metrics.ts"

const MENU_PAGE = "/[countryCode]/restaurants/[id]"
const KINDS = ["document", "navigation", "prefetch", "action"]

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

const series = (kind: string) => `{route="${MENU_PAGE}",kind="${kind}"}`
const countOf = (metrics: string, kind: string) =>
  Number(
    metrics
      .split("\n")
      .find((line) =>
        line.startsWith(
          `mtogo_storefront_page_render_duration_seconds_count${series(kind)} `,
        ),
      )
      ?.split(" ")[1],
  )

describe("storefront page render metrics listener configuration", () => {
  for (const { port, appPort, reason } of [
    { port: 0, appPort: 8000, reason: "BVA: below the minimum port" },
    { port: 65536, appPort: 8000, reason: "BVA: above the maximum port" },
    { port: 9465.5, appPort: 8000, reason: "EP: fractional port" },
    { port: NaN, appPort: 8000, reason: "EP: not a number" },
    { port: 9465, appPort: 0, reason: "BVA: app port below the minimum" },
    { port: 8000, appPort: 8000, reason: "DT: the app's own port" },
  ])
    it(`refuses ${reason}`, () => {
      assert.throws(
        () => startPageRenderMetrics({ host: "127.0.0.1", port, appPort }),
        /Invalid metrics listener configuration/,
      )
    })
})

describe("storefront page render metrics HTTP boundary", () => {
  let app: Server
  let appPort: number
  let port: number
  let stop: () => void

  beforeEach(async () => {
    app = createServer((req, res) => {
      if (req.headers["test-interrupt"]) {
        res.writeHead(200)
        res.write("partial")
        return
      }
      const status = Number(req.headers["test-status"] || 200)
      const delay = Number(req.headers["test-delay"] || 0)
      setTimeout(() => res.writeHead(status).end("page"), delay)
    })
    appPort = await listen(app)
    port = await freePort()
    stop = startPageRenderMetrics({ host: "127.0.0.1", port, appPort })
  })

  afterEach(async () => {
    stop()
    app.closeAllConnections()
    await new Promise<void>((resolve) => app.close(() => resolve()))
  })

  const scrape = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/metrics`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get("content-type") ?? "", /text\/plain/)
    return response.text()
  }
  const visit = (path: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${appPort}${path}`, init).then((r) => r.text())

  it("starts every kind of menu page render at zero", async () => {
    const metrics = await scrape()
    for (const kind of KINDS) assert.equal(countOf(metrics, kind), 0)
  })

  it("observes a full page load in seconds, without the Restaurant id or query", async () => {
    await visit("/dk/restaurants/res_01SECRET?postal_code=2200", {
      headers: { "test-delay": "300" },
    })
    const metrics = await scrape()
    assert.equal(countOf(metrics, "document"), 1)
    assert.ok(
      metrics.includes(
        `mtogo_storefront_page_render_duration_seconds_bucket{le="0.25",route="${MENU_PAGE}",kind="document"} 0`,
      ),
    )
    assert.ok(
      metrics.includes(
        `mtogo_storefront_page_render_duration_seconds_bucket{le="0.5",route="${MENU_PAGE}",kind="document"} 1`,
      ),
    )
    assert.ok(!metrics.includes("res_01SECRET"))
    assert.ok(!metrics.includes("2200"))
  })

  for (const { kind, init, reason } of [
    {
      kind: "navigation",
      init: { headers: { rsc: "1" } },
      reason: "EP: a client-side navigation renders the page payload",
    },
    {
      kind: "prefetch",
      init: { headers: { rsc: "1", "next-router-prefetch": "1" } },
      reason: "EP: a link prefetch",
    },
    {
      kind: "action",
      init: { method: "POST", headers: { "next-action": "abc" } },
      reason: "EP: a basket action re-renders the page",
    },
  ])
    it(`${reason} is a ${kind} render`, async () => {
      await visit("/dk/restaurants/res_1/", init)
      const metrics = await scrape()
      for (const other of KINDS)
        assert.equal(countOf(metrics, other), other === kind ? 1 : 0)
    })

  for (const path of [
    "/dk/restaurants",
    "/dk/restaurants/res_1/extra",
    "/dk/store",
    "/restaurants/res_1",
    "/_next/static/chunks/restaurants/res_1",
  ])
    it(`EP: does not observe ${path}`, async () => {
      await visit(path)
      const metrics = await scrape()
      for (const kind of KINDS) assert.equal(countOf(metrics, kind), 0)
      assert.ok(!metrics.includes('route="/dk'))
    })

  for (const { status, observed, reason } of [
    { status: 200, observed: 1, reason: "EP: a rendered page" },
    { status: 299, observed: 1, reason: "BVA: last 2xx" },
    { status: 300, observed: 0, reason: "BVA: first 3xx" },
    { status: 307, observed: 0, reason: "EP: middleware redirect, no render" },
    { status: 399, observed: 0, reason: "BVA: last 3xx" },
    {
      status: 400,
      observed: 1,
      reason: "BVA: first 4xx, an error page render",
    },
    {
      status: 500,
      observed: 1,
      reason: "EP: an error page the Customer waits for",
    },
  ])
    it(`${reason}: status ${status} is ${observed ? "" : "not "}observed`, async () => {
      await visit("/dk/restaurants/res_1", {
        headers: { "test-status": String(status) },
        redirect: "manual",
      })
      assert.equal(countOf(await scrape(), "document"), observed)
    })

  it("does not observe a render whose connection closed first", async () => {
    await new Promise<void>((resolve) => {
      const req = request(
        `http://127.0.0.1:${appPort}/dk/restaurants/res_1`,
        { headers: { "test-interrupt": "1" } },
        (res) => {
          res.once("data", () => {
            req.destroy()
            setTimeout(resolve, 50)
          })
        },
      )
      req.end()
    })
    assert.equal(countOf(await scrape(), "document"), 0)
  })

  it("does not observe requests to another listener in the same process", async () => {
    const other = createServer((_, res) => res.end("x"))
    const otherPort = await listen(other)
    await fetch(`http://127.0.0.1:${otherPort}/dk/restaurants/res_1`).then(
      (r) => r.text(),
    )
    other.close()
    assert.equal(countOf(await scrape(), "document"), 0)
  })

  it("answers only GET /metrics", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(response.status, 404)
    await response.text()
  })
})
