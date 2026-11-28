import type { AttentionType } from "./attention-types"

/** The operations read (#54) as `GET /admin/operations` returns it. */
export type OpenOrderStage =
  | "awaiting_acceptance"
  | "accepted_or_preparing"
  | "ready_unassigned"
  | "assigned_not_picked_up"
  | "picked_up"

/** A range of time: from `starts_at`, inclusive, to `ends_at`, exclusive. */
export type Period = { starts_at: string; ends_at: string }

export type CancellationCategory =
  | "restaurant_rejected"
  | "acceptance_timeout"
  | "customer_cancelled"
  | "unassigned_timeout"
  | "operator_cancelled"

export type CancelledPlacements = {
  total: number
  categories: { category: CancellationCategory; count: number }[]
}

/** One Copenhagen clock hour of the Orders per hour chart. */
export type PlacementHour = {
  starts_at: string
  /** The Copenhagen clock time the hour starts at, as `HH:00`. */
  local_time: string
  utc_offset: string
  /** The current hour, counted up to the calculation moment. */
  is_current: boolean
  count: number
}

export type Operations = {
  /** The one moment every figure was calculated for. */
  as_of: string
  scope: { type: "platform" } | { type: "restaurant"; restaurant_id: string }
  open_orders: {
    period: { at: string }
    total: number
    stages: { stage: OpenOrderStage; count: number }[]
    exclusions: { reason: string; count: number }[]
  }
  /** Open Orders without a Delivery agent, and those waiting over 10 min (#260). */
  unassigned_deliveries: {
    period: { at: string }
    total: number
    waiting_over_ten_minutes: number
    exclusions: { reason: string; count: number }[]
  }
  /** Raised, unresolved attention items by type, as the deliveries page lists them. */
  attention: {
    period: { at: string }
    total: number
    types: (
      | {
          type: "unassigned"
          count: number
          /** Of these, the Orders counted as waiting over 10 minutes. */
          waiting_unassigned_orders: number
        }
      | { type: Exclude<AttentionType, "unassigned">; count: number }
    )[]
    exclusions: { reason: string; count: number }[]
  }
  /** Full refunds still owed, as the Refunds page lists them. */
  full_refunds: {
    period: { at: string }
    total: number
    pending: number
    failed: number
    exclusions: { reason: string; count: number }[]
  }
  /** Orders placed in the last 24 hours, cancelled ones included (#261). */
  placements: {
    period: Period
    total: number
    cancelled: CancelledPlacements
    exclusions: { reason: string; count: number }[]
  }
  /** Placements in each of the last 24 Copenhagen clock hours, oldest first. */
  orders_per_hour: {
    period: Period
    total: number
    hours: PlacementHour[]
    exclusions: { reason: string; count: number }[]
  }
  /** Placements on each of the previous seven complete Copenhagen days. */
  placements_per_day: {
    period: Period
    total: number
    days: { date: string; count: number }[]
    /** The total divided by seven, to one decimal (ADR-0015). */
    average_per_day: number
    exclusions: { reason: string; count: number }[]
  }
}

/** Short operator wording for who or what cancelled an Order. */
export const cancellationShortLabels: Record<CancellationCategory, string> = {
  restaurant_rejected: "Restaurant rejected",
  acceptance_timeout: "Not accepted in time",
  customer_cancelled: "Customer",
  unassigned_timeout: "No agent in time",
  operator_cancelled: "MTOGO operator",
}

/**
 * The cancellations among the placements as one line, largest category
 * first: "3 cancelled: 2 Customer, 1 Restaurant rejected".
 */
export const cancelledSummary = ({
  total,
  categories,
}: CancelledPlacements) => {
  const parts = categories
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
    .map(
      ({ category, count }) => `${count} ${cancellationShortLabels[category]}`,
    )
  return parts.length
    ? `${total} cancelled: ${parts.join(", ")}`
    : `${total} cancelled`
}

/**
 * Each hour's name in the chart and its table: the Copenhagen clock time,
 * with the UTC offset when that time occurs twice (the night the clocks go
 * back) and "so far" for the current hour.
 */
export const hourLabels = (hours: PlacementHour[]) =>
  hours.map(({ local_time, utc_offset, is_current }) => {
    const isRepeated =
      hours.filter((other) => other.local_time === local_time).length > 1
    const notes = [isRepeated && utc_offset, is_current && "so far"].filter(
      Boolean,
    )
    return notes.length ? `${local_time} (${notes.join(", ")})` : local_time
  })

/**
 * The hour with the most placements, named as in the chart (the earlier one
 * on a tie), or null when none was placed.
 */
export const peakHour = (hours: PlacementHour[]) => {
  const labels = hourLabels(
    hours.map((hour) => ({ ...hour, is_current: false })),
  )
  let peak: { label: string; count: number } | null = null
  for (const [index, { count }] of hours.entries())
    if (count > (peak?.count ?? 0)) peak = { label: labels[index], count }
  return peak
}

/** A Copenhagen date as a weekday and day, such as "Wed 21 Oct". */
export const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`))

/** A Copenhagen day and time to the minute, as a period's edge: "27 Nov, 08:06". */
export const formatPeriodEdge = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))

/** Operator wording for each stage, in the order work moves through them. */
export const openOrderStageLabels: Record<OpenOrderStage, string> = {
  awaiting_acceptance: "Awaiting acceptance",
  accepted_or_preparing: "Accepted or preparing",
  ready_unassigned: "Ready, no agent",
  assigned_not_picked_up: "Agent assigned, not picked up",
  picked_up: "Picked up, not handed over",
}

/** A Copenhagen date and time to the second, as the calculation moment. */
export const formatCalculatedAt = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
