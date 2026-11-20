import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { register } from "../../instrumentation"

jest.setTimeout(120000)

let stop: (() => void) | undefined

medusaIntegrationTestRunner({
  dbName: "medusa_ci_request_metrics_http",
  env: {
    JWT_SECRET: "ci-only-metrics-secret",
    REDIS_URL: "",
    MEDUSA_WORKER_MODE: "shared",
    PORT: "19091",
    MTOGO_METRICS_ENABLED: "1",
    MTOGO_METRICS_HOST: "127.0.0.1",
    MTOGO_METRICS_PORT: "19465",
    STORE_CORS: "http://storefront.synthetic.test",
  },
  // The test runner loads Medusa directly rather than invoking its CLI hook.
  // Use the same register entry point after its config has been initialized.
  hooks: {
    beforeServerStart: async () => {
      stop = register()
    },
  },
  testSuite: ({ api, getContainer }) => {
    const scrape = async () => {
      const response = await fetch("http://127.0.0.1:19465/metrics")
      expect(response.status).toBe(200)
      return response.text()
    }
    afterAll(() => stop?.())
    // Tests share one process-wide counter, so compare a series before/after.
    const seriesValue = (metrics: string, labels: string) =>
      Number(
        metrics
          .split("\n")
          .find((line) =>
            line.startsWith(`mtogo_http_requests_total{${labels}} `),
          )
          ?.split(" ")[1] ?? 0,
      )

    // The runner clears the database after each test, so each test creates
    // its own synthetic publishable key linked to a synthetic sales channel.
    const publishableHeaders = async () => {
      const container = getContainer()
      const {
        result: [channel],
      } = await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: "Metrics synthetic channel" }] },
      })
      const {
        result: [key],
      } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "Metrics synthetic key",
              type: "publishable",
              created_by: "",
            },
          ],
        },
      })
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: key.id, add: [channel.id] },
      })
      return { "x-publishable-api-key": key.token }
    }

    it("exports a real product read once, including early refusals with bounded labels", async () => {
      const initial = await scrape()
      expect(initial).toContain('route="/store/products",status="200"} 0')
      // No observations yet is a zero count, never a fabricated duration.
      expect(initial).toContain(
        'mtogo_http_request_duration_seconds_count{method="GET",route="/store/products"} 0',
      )
      const headers = await publishableHeaders()
      const read = await api.get("/store/products?limit=1", { headers })
      expect(read.status).toBe(200)
      expect(read.data.products).toEqual([])
      const measured = await scrape()
      expect(measured).toContain(
        'method="GET",route="/store/products",status="200"} 1',
      )
      expect(register()).toBeUndefined()

      const refused = await api.get("/store/products?private=discard", {
        validateStatus: () => true,
      })
      expect(refused.status).toBe(400)
      const malformed = await api.post("/store/products", '{"secret":', {
        headers: { "content-type": "application/json" },
        transformRequest: [(body) => body],
        validateStatus: () => true,
      })
      expect(malformed.status).toBe(400)
      for (const id of ["synthetic-one", "synthetic-two"])
        expect(
          (
            await api.get(`/store/products/${id}`, {
              headers,
              validateStatus: () => true,
            })
          ).status,
        ).toBe(404)
      await api.get("/health")
      const publicMetrics = await api.get("/metrics", {
        validateStatus: () => true,
      })
      expect(publicMetrics.status).toBe(404)
      expect(JSON.stringify(publicMetrics.data)).not.toContain(
        "mtogo_http_requests_total",
      )
      const final = await scrape()
      expect(final).toContain(
        'method="GET",route="/store/products",status="200"} 1',
      )
      // Publishable-key and body-parser refusals happen before any route match.
      expect(final).toContain(
        'method="GET",route="early_rejection",status="400"} 1',
      )
      expect(final).toContain(
        'method="POST",route="early_rejection",status="400"} 1',
      )
      expect(final).toContain(
        'method="GET",route="/store/products/:id",status="404"} 2',
      )
      expect(final).not.toMatch(/private|discard|secret|synthetic|health/)
      expect(final).not.toContain(headers["x-publishable-api-key"])
      expect(await scrape()).toBe(final)
    })

    it("labels an invalid body by its route pattern and collapses IDs and query strings", async () => {
      const headers = await publishableHeaders()
      const invalid = await api.post(
        "/store/carts",
        { region_id: 12345, secret_field: "discard" },
        { headers, validateStatus: () => true },
      )
      expect(invalid.status).toBe(400)
      for (const path of [
        "/store/carts/cart_synthetic_one?fields=secret",
        "/store/carts/cart_synthetic_two",
      ])
        expect(
          (await api.get(path, { headers, validateStatus: () => true })).status,
        ).toBe(404)
      const metrics = await scrape()
      expect(metrics).toContain(
        'mtogo_http_requests_total{method="POST",route="/store/carts",status="400"} 1',
      )
      expect(metrics).toContain(
        'mtogo_http_requests_total{method="GET",route="/store/carts/:id",status="404"} 2',
      )
      expect(metrics).not.toMatch(/cart_synthetic|secret|discard/)
    })

    it("groups unknown routes and methods into fixed categories and excludes probes, Admin assets and streams", async () => {
      const headers = await publishableHeaders()
      for (const path of [
        "/store/unknown-secret-one",
        "/store/unknown-secret-two?q=secret",
        "/no-such-namespace-secret",
      ])
        expect(
          (await api.get(path, { headers, validateStatus: () => true })).status,
        ).toBe(404)
      const unknownMethod = await api.request({
        method: "PROPFIND",
        url: "/store/products",
        headers,
        validateStatus: () => true,
      })
      const baseline = await scrape()
      expect(baseline).toContain(
        'mtogo_http_requests_total{method="GET",route="unmatched",status="404"} 3',
      )
      expect(baseline).toContain(
        `mtogo_http_requests_total{method="OTHER",route="unmatched",status="${unknownMethod.status}"} 1`,
      )
      expect(baseline).not.toMatch(/secret|PROPFIND|no-such/)

      await api.get("/health")
      await api.get("/app", { validateStatus: () => true })
      await api.get("/app/assets/secret.js", { validateStatus: () => true })
      expect(await scrape()).toBe(baseline)

      // Refused before a stream is established, so it keeps its ordinary outcome.
      const stream = await api.get("/partner/orders/stream", {
        validateStatus: () => true,
      })
      expect(stream.status).toBe(401)
      expect(await scrape()).toContain(
        'mtogo_http_requests_total{method="GET",route="early_rejection",status="401"} 1',
      )
    })

    it("labels a successful CORS preflight as unrouted, not as a rejection", async () => {
      const labels = 'method="OPTIONS",route="unrouted",status="204"'
      const before = seriesValue(await scrape(), labels)
      const preflight = await api.request({
        method: "OPTIONS",
        url: "/store/products",
        headers: {
          origin: "http://storefront.synthetic.test",
          "access-control-request-method": "GET",
        },
        validateStatus: () => true,
      })
      expect(preflight.status).toBe(204)
      expect(seriesValue(await scrape(), labels)).toBe(before + 1)
    })

    it("separates a controlled server failure from success and refusal, with a duration for each completed response", async () => {
      const headers = await publishableHeaders()
      const durationCount = (metrics: string, labels: string) =>
        Number(
          metrics
            .split("\n")
            .find((line) =>
              line.startsWith(
                `mtogo_http_request_duration_seconds_count{${labels}} `,
              ),
            )
            ?.split(" ")[1] ?? 0,
        )
      const regionLabels = 'method="GET",route="/store/regions"'
      const before = await scrape()

      expect((await api.get("/store/regions", { headers })).status).toBe(200)
      // Test-only failure inside the process: the region read rejects once,
      // so the real route and Medusa's error handler produce the 5xx.
      const regionService = getContainer().resolve(Modules.REGION)
      const regionReadFailure = jest
        .spyOn(regionService, "listAndCountRegions")
        .mockRejectedValueOnce(new Error("synthetic-region-failure"))
      try {
        const failed = await api.get("/store/regions?q=secret_marker", {
          headers,
          validateStatus: () => true,
        })
        expect(failed.status).toBe(500)
        expect(regionReadFailure).toHaveBeenCalledTimes(1)
      } finally {
        regionReadFailure.mockRestore()
      }
      expect(
        (
          await api.get("/store/regions", {
            headers,
            params: { limit: "not-a-number" },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(400)

      const after = await scrape()
      for (const status of ["200", "500", "400"])
        expect(seriesValue(after, `${regionLabels},status="${status}"`)).toBe(
          seriesValue(before, `${regionLabels},status="${status}"`) + 1,
        )
      expect(durationCount(after, regionLabels)).toBe(
        durationCount(before, regionLabels) + 3,
      )
      expect(after).toMatch(
        /mtogo_http_request_duration_seconds_bucket\{le="5",method="GET",route="\/store\/regions"\} \d+/,
      )
      expect(after).not.toMatch(/synthetic-region-failure|secret_marker/)
    })

    it("counts an unauthenticated admin request once as an early rejection", async () => {
      const labels = 'method="GET",route="early_rejection",status="401"'
      const before = seriesValue(await scrape(), labels)
      const refused = await api.get("/admin/orders/order_synthetic_one", {
        validateStatus: () => true,
      })
      expect(refused.status).toBe(401)
      const metrics = await scrape()
      expect(seriesValue(metrics, labels)).toBe(before + 1)
      expect(metrics).not.toContain("order_synthetic")
    })
  },
})
