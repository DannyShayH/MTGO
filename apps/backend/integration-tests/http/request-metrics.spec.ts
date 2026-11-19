import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
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

    it("exports a real product read once, including early refusals with bounded labels", async () => {
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
      expect(await scrape()).toContain(
        'route="/store/products",status="200"} 0',
      )
      const headers = { "x-publishable-api-key": key.token }
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
      expect(final).toContain(
        'method="GET",route="/store/products",status="400"} 1',
      )
      expect(final).toContain(
        'method="POST",route="/store/products",status="400"} 1',
      )
      expect(final).toContain(
        'method="GET",route="/store/products/:id",status="404"} 2',
      )
      expect(final).not.toMatch(/private|discard|secret|synthetic|health/)
      expect(final).not.toContain(key.token)
      expect(await scrape()).toBe(final)
    })
  },
})
