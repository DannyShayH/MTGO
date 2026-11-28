import type { TransitTimeCounts } from "../../modules/delivery/service"
import type { ProcessingTimeCounts } from "../../modules/order-operation/service"
import { previousSevenDays, type Period } from "./volume"

/** Why an Order was left out of a time measure (#262). */
export type ExclusionReason =
  "no_placement_time" | "no_handover_time" | "no_pickup_time"

const excluded = (reason: ExclusionReason, count: number) => ({
  reason,
  count,
})

/** The database average to whole seconds; no Order included is no average. */
const wholeSeconds = (value: number | null) =>
  value === null ? null : Math.round(value)

/**
 * Order processing time (ADR-0015): placement to handover for Orders handed
 * over in the period, as an average over the Orders included. An Order
 * missing either time is excluded by reason, never counted as zero; each
 * reason is named, zero when none.
 */
export const processingTimeFigure = (
  counts: ProcessingTimeCounts,
  period: Period,
) => ({
  period,
  included: counts.included,
  average_seconds: wholeSeconds(counts.average_seconds),
  exclusions: [
    excluded("no_placement_time", counts.no_placement_time),
    excluded("no_handover_time", counts.no_handover_time),
  ],
})

/**
 * Delivery transit time (ADR-0015): pickup to handover for the Orders handed
 * over in the same period, so kitchen delays read apart from delivery delays.
 * A delivery without a recorded pickup is excluded, never counted as zero.
 */
export const transitTimeFigure = (
  counts: TransitTimeCounts,
  period: Period,
) => ({
  period,
  included: counts.included,
  average_seconds: wholeSeconds(counts.average_seconds),
  exclusions: [excluded("no_pickup_time", counts.no_pickup_time)],
})

/**
 * How much the last 24 hours' average differs from the previous seven
 * days', as a whole percentage: negative is faster, positive slower. Null
 * when either has no average, so a missing base is never read as a change.
 */
export const changePercent = (
  current: number | null,
  previous: number | null,
) =>
  current === null || !previous
    ? null
    : Math.round(((current - previous) / previous) * 100) || 0

/** One day's average, as the database grouped it by Copenhagen date. */
export type DailyAverage = {
  date: string
  included: number
  average_seconds: number | null
}

const dayAverage = (rows: DailyAverage[], date: string) => {
  const row = rows.find((candidate) => candidate.date === date)
  return {
    included: row?.included ?? 0,
    average_seconds: wholeSeconds(row?.average_seconds ?? null),
  }
}

/**
 * Order processing time and Delivery transit time over the previous seven
 * complete Copenhagen days (#262), the same days as placements per day: the
 * average over every Order handed over in them, with exclusions, and each
 * day's own average for the trend. A day without handovers has no average,
 * never zero.
 */
export const timesPerDayFigure = (
  counts: {
    processing: DailyAverage[]
    transit: DailyAverage[]
    processingTotal: ProcessingTimeCounts
    transitTotal: TransitTimeCounts
  },
  now: Date,
) => {
  const { dates, ...period } = previousSevenDays(now)
  return {
    period,
    processing_time: processingTimeFigure(counts.processingTotal, period),
    delivery_transit_time: transitTimeFigure(counts.transitTotal, period),
    days: dates.map((date) => ({
      date,
      processing_time: dayAverage(counts.processing, date),
      delivery_transit_time: dayAverage(counts.transit, date),
    })),
  }
}
