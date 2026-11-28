import {
  CANCELLATION_CATEGORIES,
  type CancellationCategory,
} from "../../modules/order-operation/models/order-operation"
import type { PlacementPeriod } from "../../modules/order-operation/service"
import {
  addCopenhagenDays,
  copenhagenDateOf,
  copenhagenDayStart,
  copenhagenParts,
  copenhagenUtcOffset,
} from "../shared/copenhagen-time"

const HOUR_MS = 60 * 60 * 1000
const HOURS_SHOWN = 24
const DAYS_SHOWN = 7

/** A range of time: from `starts_at`, inclusive, to `ends_at`, exclusive. */
export type Period = PlacementPeriod

/** The rolling 24 hours (#261): from `now` minus 24 hours to `now`. */
export const last24Hours = (now: Date): Period => ({
  starts_at: new Date(now.getTime() - HOURS_SHOWN * HOUR_MS).toISOString(),
  ends_at: now.toISOString(),
})

/**
 * The start of the clock hour an instant falls in. Copenhagen's offset is
 * always whole hours, so its clock hours start on UTC hours, and the
 * repeated hour on the night the clocks go back is two separate hours.
 */
const hourStart = (instant: Date) =>
  Math.floor(instant.getTime() / HOUR_MS) * HOUR_MS

/**
 * The 24 Copenhagen clock hours ending with the current one, which runs
 * only up to `now`: the period the Orders per hour chart counts.
 */
export const hourWindow = (now: Date): Period => ({
  starts_at: new Date(
    hourStart(now) - (HOURS_SHOWN - 1) * HOUR_MS,
  ).toISOString(),
  ends_at: now.toISOString(),
})

/**
 * The previous seven complete Copenhagen calendar days: from midnight a week
 * before today to midnight starting today. A 23- or 25-hour day is one day.
 */
export const previousSevenDays = (now: Date): Period & { dates: string[] } => {
  const today = copenhagenDateOf(now)
  const dates = Array.from({ length: DAYS_SHOWN }, (_, index) =>
    addCopenhagenDays(today, index - DAYS_SHOWN),
  )
  return {
    starts_at: copenhagenDayStart(dates[0]).toISOString(),
    ends_at: copenhagenDayStart(today).toISOString(),
    dates,
  }
}

export type PlacementCount = {
  /** The cancellation category, or null while the Order is not cancelled. */
  category: CancellationCategory | null
  count: number
}

/**
 * Orders placed in a period, with those now cancelled by category (#261).
 * A cancelled Order stays in the volume: cancellations are part of it, not
 * taken from it. Every category is named, zero when none.
 */
export const placementsFigure = (rows: PlacementCount[], period: Period) => {
  const cancelledBy = (category: CancellationCategory) =>
    rows.find((row) => row.category === category)?.count ?? 0
  const categories = CANCELLATION_CATEGORIES.map((category) => ({
    category,
    count: cancelledBy(category),
  }))
  return {
    period,
    total: rows.reduce((sum, { count }) => sum + count, 0),
    cancelled: {
      total: categories.reduce((sum, { count }) => sum + count, 0),
      categories,
    },
    // Placements are selected by placement time; an Order without one
    // (legacy) cannot be in any period, so none is left out of it.
    exclusions: [],
  }
}

/**
 * Placements in each of the last 24 Copenhagen clock hours (#261), oldest
 * first. Each hour states its Copenhagen clock time and UTC offset, so the
 * repeated hour on the night the clocks go back reads as two hours; the
 * current hour is marked `is_current`; an hour without Orders is a real zero.
 */
export const ordersPerHourFigure = (
  rows: { starts_at: string; count: number }[],
  now: Date,
) => {
  const period = hourWindow(now)
  const counts = new Map(
    rows.map(({ starts_at, count }) => [Date.parse(starts_at), count]),
  )
  const first = Date.parse(period.starts_at)
  const hours = Array.from({ length: HOURS_SHOWN }, (_, index) => {
    const start = new Date(first + index * HOUR_MS)
    const { hour } = copenhagenParts(start)
    return {
      starts_at: start.toISOString(),
      local_time: `${String(hour).padStart(2, "0")}:00`,
      utc_offset: copenhagenUtcOffset(start),
      is_current: index === HOURS_SHOWN - 1,
      count: counts.get(start.getTime()) ?? 0,
    }
  })
  return {
    period,
    total: hours.reduce((sum, { count }) => sum + count, 0),
    hours,
    exclusions: [],
  }
}

/**
 * Placements on each of the previous seven complete Copenhagen days (#261),
 * and the seven-day average (ADR-0015): the total divided by seven, rounded
 * to one decimal, so days without Orders and 23- or 25-hour days each count
 * as one day.
 */
export const placementsPerDayFigure = (
  rows: { date: string; count: number }[],
  now: Date,
) => {
  const { dates, ...period } = previousSevenDays(now)
  const counts = new Map(rows.map(({ date, count }) => [date, count]))
  const days = dates.map((date) => ({ date, count: counts.get(date) ?? 0 }))
  const total = days.reduce((sum, { count }) => sum + count, 0)
  return {
    period,
    total,
    days,
    average_per_day: Math.round((total / DAYS_SHOWN) * 10) / 10,
    exclusions: [],
  }
}
