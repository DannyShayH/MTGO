import { MedusaError } from "@medusajs/framework/utils"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../restaurant-finance/calculation"

export const STATISTICS_PERIODS = [
  "last_30_days",
  "previous_month",
  "all_time",
] as const

export type StatisticsPeriodKey = (typeof STATISTICS_PERIODS)[number]

/**
 * The handover-time interval a statistics read covers, inclusive of `from`
 * and exclusive of `to`. A `null` bound is open.
 */
export type StatisticsPeriod = {
  key: StatisticsPeriodKey
  from: Date | null
  to: Date | null
}

/** A rolling interval, inclusive of its start and exclusive of its end. */
export function lastThirtyDays(now: Date) {
  return {
    key: "last_30_days" as const,
    from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    to: now,
  }
}

/** The Copenhagen calendar month before the one `now` falls in (#53's bonus month). */
function previousMonth(now: Date): StatisticsPeriod {
  const current = copenhagenMonthPeriod(copenhagenMonthOf(now))
  const lastInstantBefore = new Date(current.starts_at.getTime() - 1)
  const { starts_at, ends_at } = copenhagenMonthPeriod(
    copenhagenMonthOf(lastInstantBefore),
  )
  return { key: "previous_month", from: starts_at, to: ends_at }
}

/** Resolves a period key to its bounds at the instant `now`. */
export function resolveStatisticsPeriod(
  key: StatisticsPeriodKey,
  now: Date,
): StatisticsPeriod {
  switch (key) {
    case "last_30_days":
      return lastThirtyDays(now)
    case "previous_month":
      return previousMonth(now)
    case "all_time":
      return { key, from: null, to: null }
    default: {
      const unknown: never = key
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown Feedback statistics period: ${String(unknown)}`,
      )
    }
  }
}
