jest.mock("@medusajs/framework/config", () => ({
  configManager: { config: { projectConfig: { workerMode: "shared" } } },
}))
jest.mock("@medusajs/framework/logger", () => ({ logger: { warn: jest.fn() } }))
jest.mock("../request-metrics", () => ({ startRequestMetrics: jest.fn() }))
jest.mock("../../api/request-logging", () => ({
  startRequestLogging: jest.fn(() => () => {}),
}))
jest.mock("node:cluster", () => ({ isWorker: false }))

describe("supported Medusa instrumentation startup", () => {
  const previous = process.env.MTOGO_METRICS_ENABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.MTOGO_METRICS_ENABLED
    else process.env.MTOGO_METRICS_ENABLED = previous
    jest.resetModules()
  })

  it.each([
    {
      enabled: "",
      mode: "shared",
      clustered: false,
      expectedCalls: 0,
      reason: "DT: optional monitoring disabled",
    },
    {
      enabled: "1",
      mode: "worker",
      clustered: false,
      expectedCalls: 0,
      reason: "DT: separate worker has no exporter",
    },
    {
      enabled: "1",
      mode: "server",
      clustered: true,
      expectedCalls: 0,
      reason: "DT: unsupported cluster children have no competing exporters",
    },
    {
      enabled: "1",
      mode: "server",
      clustered: false,
      expectedCalls: 1,
      reason: "DT: single HTTP server starts once",
    },
    {
      enabled: "1",
      mode: "shared",
      clustered: false,
      expectedCalls: 1,
      reason: "DT: shared HTTP server starts once",
    },
  ])("$reason", ({ enabled, mode, clustered, expectedCalls }) => {
    process.env.MTOGO_METRICS_ENABLED = enabled
    const { configManager } = require("@medusajs/framework/config")
    configManager.config.projectConfig.workerMode = mode
    require("node:cluster").isWorker = clustered
    const { startRequestMetrics } = require("../request-metrics")
    startRequestMetrics.mockReturnValue(() => {})
    const { register } = require("../../../instrumentation")
    register()
    register()
    expect(startRequestMetrics).toHaveBeenCalledTimes(expectedCalls)
  })

  it.each([
    { mode: "shared", enabled: "", calls: 1, reason: "DT: metrics disabled" },
    { mode: "server", enabled: "1", calls: 1, reason: "DT: metrics enabled" },
    { mode: "worker", enabled: "1", calls: 0, reason: "DT: no API requests" },
  ])(
    "$reason: request logging starts $calls time(s)",
    ({ mode, enabled, calls }) => {
      process.env.MTOGO_METRICS_ENABLED = enabled
      const { configManager } = require("@medusajs/framework/config")
      configManager.config.projectConfig.workerMode = mode
      require("node:cluster").isWorker = false
      const { startRequestLogging } = require("../../api/request-logging")
      const { startRequestMetrics } = require("../request-metrics")
      startRequestMetrics.mockReturnValue(() => {})
      const { register } = require("../../../instrumentation")
      register()
      register()
      expect(startRequestLogging).toHaveBeenCalledTimes(calls)
    },
  )

  it("does not fail application startup on invalid exporter configuration", () => {
    process.env.MTOGO_METRICS_ENABLED = "1"
    const { startRequestMetrics } = require("../request-metrics")
    startRequestMetrics.mockImplementation(() => {
      throw new Error("synthetic private detail")
    })
    const { register } = require("../../../instrumentation")
    expect(() => register()).not.toThrow()
    const { logger } = require("@medusajs/framework/logger")
    expect(logger.warn).toHaveBeenCalledWith(
      "Request metrics unavailable; API startup continues",
    )
  })
})
