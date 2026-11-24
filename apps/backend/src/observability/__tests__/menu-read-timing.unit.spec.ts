import { once } from "node:events"
import { createServer } from "node:http"
import { startRequestMetrics } from "../request-metrics"
import { startMenuReadTiming } from "../menu-read-timing"

async function freePort() {
  const server = createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const { port } = server.address() as { port: number }
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

/** A clock the test moves by hand, in seconds. */
function manualClock() {
  let seconds = 0
  return {
    now: () => seconds,
    advance: (by: number) => {
      seconds += by
    },
  }
}

describe("menu read timing on the private exporter", () => {
  let port: number
  let stop: () => void

  beforeEach(async () => {
    port = await freePort()
    stop = startRequestMetrics({
      host: "127.0.0.1",
      port,
      apiPort: await freePort(),
      warn: jest.fn(),
    })
  })
  afterEach(() => stop())

  const scrape = async () =>
    (await fetch(`http://127.0.0.1:${port}/metrics`)).text()
  const countOf = (metrics: string, part: string) =>
    Number(
      metrics.match(
        new RegExp(
          `^mtogo_menu_read_part_duration_seconds_count\\{part="${part}"\\} (\\S+)$`,
          "m",
        ),
      )?.[1],
    )

  it("starts every part at zero, so a quiet window is an observation", async () => {
    const metrics = await scrape()
    for (const part of [
      "restaurant",
      "dish_prices",
      "photos",
      "photo_urls",
      "food_information",
      "whole_read",
    ])
      expect(countOf(metrics, part)).toBe(0)
  })

  it("observes each part and the whole read once, in seconds, labelled only by part", async () => {
    const clock = manualClock()
    const timing = startMenuReadTiming({ now: clock.now })
    await timing.time("restaurant", async () => clock.advance(0.3))
    await Promise.all([
      timing.time("dish_prices", async () => clock.advance(0.8)),
      timing.time("photos", async () => undefined),
      timing.time("photo_urls", async () => undefined),
      timing.time("food_information", async () => undefined),
    ])
    timing.finish({ log: jest.fn() })

    const metrics = await scrape()
    for (const part of [
      "restaurant",
      "dish_prices",
      "photos",
      "photo_urls",
      "food_information",
      "whole_read",
    ])
      expect(countOf(metrics, part)).toBe(1)
    expect(metrics).toContain(
      'mtogo_menu_read_part_duration_seconds_bucket{le="0.25",part="restaurant"} 0',
    )
    expect(metrics).toContain(
      'mtogo_menu_read_part_duration_seconds_bucket{le="0.5",part="restaurant"} 1',
    )
    expect(metrics).toContain(
      'mtogo_menu_read_part_duration_seconds_bucket{le="1",part="whole_read"} 0',
    )
    expect(metrics).toContain(
      'mtogo_menu_read_part_duration_seconds_bucket{le="2",part="whole_read"} 1',
    )
    const labels = metrics
      .split("\n")
      .filter((line) => line.startsWith("mtogo_menu_read_part_"))
      .flatMap((line) => [...line.matchAll(/(\w+)="/g)].map(([, name]) => name))
    expect(new Set(labels)).toEqual(new Set(["le", "part"]))
  })

  it("times a part that fails and passes the failure on", async () => {
    const timing = startMenuReadTiming()
    await expect(
      timing.time("photos", async () => {
        throw new Error("storage down")
      }),
    ).rejects.toThrow("storage down")
    expect(countOf(await scrape(), "photos")).toBe(1)
  })
})

describe("slow menu read log line", () => {
  it.each([
    { seconds: 0.999, logged: false, reason: "BVA: just under 1 s" },
    { seconds: 1, logged: false, reason: "BVA: exactly 1 s is not over" },
    { seconds: 1.001, logged: true, reason: "BVA: just over 1 s" },
  ])("$reason", async ({ seconds, logged }) => {
    const clock = manualClock()
    const timing = startMenuReadTiming({ now: clock.now })
    await timing.time("dish_prices", async () => clock.advance(seconds))
    const logger = { log: jest.fn() }
    timing.finish(logger)
    expect(logger.log).toHaveBeenCalledTimes(logged ? 1 : 0)
  })

  it("records the time of each part in whole milliseconds as a safe log record, without IDs", async () => {
    const clock = manualClock()
    const timing = startMenuReadTiming({ now: clock.now })
    await timing.time("restaurant", async () => clock.advance(0.2004))
    await timing.time("dish_prices", async () => clock.advance(1.5))
    const logger = { log: jest.fn() }
    timing.finish(logger, { dishes: 12, photos: 9 })
    const [level, message, record] = logger.log.mock.calls[0]
    expect([level, message]).toEqual(["warn", "Slow Customer menu read"])
    expect(record).toMatchObject({
      service: "backend",
      event: "menu.read.slow",
      whole_read_ms: 1700,
      restaurant_ms: 200,
      dish_prices_ms: 1500,
      dishes: 12,
      photos: 9,
    })
    expect(record).not.toHaveProperty("photos_ms")
  })
})
