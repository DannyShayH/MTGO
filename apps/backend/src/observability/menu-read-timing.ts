import { createLogRecord } from "@dtc/logging"
import { Histogram, type Registry } from "@prometheus-io/client"
import { DURATION_BUCKETS_SECONDS } from "./duration-buckets"

/**
 * The parts of one Customer menu read (`readRestaurantMenuStep`), and the
 * whole read. Some parts run at the same time, so their times do not add up
 * to the whole read.
 */
export const MENU_READ_PARTS = [
  "restaurant",
  "dish_prices",
  "photos",
  "photo_urls",
  "food_information",
] as const
export type MenuReadPart = (typeof MENU_READ_PARTS)[number]
const WHOLE_READ = "whole_read"

/** A read slower than this writes one log line with its breakdown. */
const SLOW_READ_SECONDS = 1

// One process-wide histogram: the menu step observes it whether or not the
// exporter runs. Only the exporter's registry exposes it (`registers: []`).
const partDuration = new Histogram({
  name: "mtogo_menu_read_part_duration_seconds",
  help: "Server-side seconds of each part of a Customer menu read and of the whole read; parts can overlap",
  labelNames: ["part"] as const,
  buckets: DURATION_BUCKETS_SECONDS,
  registers: [],
})

/**
 * Adds the menu read histogram to an exporter registry, with every part
 * starting at zero so a quiet window is an observation, not a missing series.
 */
export function registerMenuReadMetrics(registry: Registry) {
  partDuration.reset()
  for (const part of [...MENU_READ_PARTS, WHOLE_READ])
    partDuration.zero({ part })
  registry.registerMetric(partDuration)
}

const hrSeconds = () => Number(process.hrtime.bigint()) / 1e9
const toMs = (seconds: number) => Math.round(seconds * 1000)

/**
 * Times one menu read. `time` measures a part, even when it fails; `finish`
 * observes the whole read and logs a `menu.read.slow` record (ADR-0019)
 * with each part's time when it took over a second.
 * Labels and the log line carry part names and counts only, never IDs.
 */
export function startMenuReadTiming({ now = hrSeconds } = {}) {
  const startedAt = now()
  const parts: Partial<Record<MenuReadPart, number>> = {}
  return {
    async time<T>(part: MenuReadPart, work: () => Promise<T>): Promise<T> {
      const partStartedAt = now()
      try {
        return await work()
      } finally {
        const seconds = now() - partStartedAt
        parts[part] = seconds
        partDuration.observe({ part }, seconds)
      }
    },
    finish(
      logger: { log: (level: string, message: string, meta: object) => void },
      counts: { dishes?: number; photos?: number } = {},
    ) {
      const seconds = now() - startedAt
      partDuration.observe({ part: WHOLE_READ }, seconds)
      if (seconds <= SLOW_READ_SECONDS) return
      const record = createLogRecord("backend", "menu.read.slow", {
        whole_read_ms: toMs(seconds),
        ...Object.fromEntries(
          Object.entries(parts).map(([part, value]) => [
            `${part}_ms`,
            toMs(value),
          ]),
        ),
        ...counts,
      })
      logger.log(record.level, record.msg, record)
    },
  }
}
