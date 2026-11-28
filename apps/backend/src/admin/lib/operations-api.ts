import type { AttentionType } from "./attention-types"

/** How the page names the Restaurants its figures describe (#264). */
export type ScopeWording = {
  /** "All Restaurants", or the chosen Restaurant's name, to start a sentence. */
  label: string
  /** "across all Restaurants", or "at <name>", to end one. */
  across: string
}

/** All Restaurants without a choice, else the chosen Restaurant by name. */
export const scopeWording = (restaurantName: string | null): ScopeWording =>
  restaurantName
    ? { label: restaurantName, across: `at ${restaurantName}` }
    : { label: "All Restaurants", across: "across all Restaurants" }

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
  /** Placement to handover, for Orders handed over in the last 24 hours (#262). */
  processing_time: ComparedTimeMeasure<ProcessingExclusionReason>
  /** Pickup to handover, for the same Orders (#262). */
  delivery_transit_time: ComparedTimeMeasure<TransitExclusionReason>
  /** Both times over the previous seven complete Copenhagen days (#262). */
  times_per_day: {
    period: Period
    processing_time: TimeMeasure<ProcessingExclusionReason>
    delivery_transit_time: TimeMeasure<TransitExclusionReason>
    /** Oldest first; a day without handovers has no average. */
    days: {
      date: string
      processing_time: DayAverage
      delivery_transit_time: DayAverage
    }[]
  }
  /** Of the Orders placed in the last 24 hours, those ended without handover (#263). */
  unfulfilled_orders: {
    period: Period
    placed: number
    ended: number
    unfulfilled: number
    /** Unfulfilled of ended, to one decimal; null while none has ended. */
    rate_percent: number | null
    /** Every cause, Customer first, then Restaurant, then MTOGO. */
    causes: { cause: UnfulfilledCause; group: CauseGroup; count: number }[]
    groups: { group: CauseGroup; count: number }[]
    /** The Orders still open: in neither number of the rate. */
    exclusions: { reason: "still_open"; count: number }[]
  }
  /** #51's platform-wide experience rating for its last 30 days (#263). */
  customer_rating: {
    period: Period & { key: "last_30_days" }
    /** One decimal, 1 to 5; null without ratings, never zero. */
    average: number | null
    count: number
    exclusions: { reason: string; count: number }[]
  } | null
}

export type CauseGroup = "customer" | "restaurant" | "mtogo"
export type UnfulfilledCause = CancellationCategory | "delivery_failed"

/**
 * Every cause of an Unfulfilled Order in the one order the page shows them:
 * Customer first, then Restaurant, then MTOGO. The cancellations under
 * Orders placed and the Unfulfilled chart list them alike, so the same
 * number sits in the same place in both.
 */
export const CAUSE_ORDER: readonly UnfulfilledCause[] = [
  "customer_cancelled",
  "restaurant_rejected",
  "acceptance_timeout",
  "unassigned_timeout",
  "operator_cancelled",
  "delivery_failed",
]

/**
 * Operator wording for each cause, shared by every list of causes. "Failed"
 * names only the delivery outcome (GLOSSARY: Unfulfilled Order).
 */
export const causeLabels: Record<UnfulfilledCause, string> = {
  customer_cancelled: "Customer cancelled",
  restaurant_rejected: "Restaurant rejected",
  acceptance_timeout: "Restaurant did not accept in time",
  unassigned_timeout: "No Delivery agent in time",
  operator_cancelled: "MTOGO operator cancelled",
  delivery_failed: "Delivery failed",
}

/** Rows that name a cause, in `CAUSE_ORDER`. */
export const inCauseOrder = <Row extends { category: UnfulfilledCause }>(
  rows: Row[],
) =>
  [...rows].sort(
    (a, b) => CAUSE_ORDER.indexOf(a.category) - CAUSE_ORDER.indexOf(b.category),
  )

export const causeGroupLabels: Record<CauseGroup, string> = {
  customer: "Customer",
  restaurant: "Restaurant",
  mtogo: "MTOGO",
}

/** A rate as people read it: "10%", "66.7%", or null while there is none. */
export const formatRate = (percent: number | null) =>
  percent === null
    ? null
    : `${percent.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`

/** An average rating to one decimal, "4.0", or null without ratings. */
export const formatRating = (average: number | null) =>
  average === null ? null : average.toFixed(1)

/** One Copenhagen day's average time and the Orders it includes. */
export type DayAverage = { included: number; average_seconds: number | null }

/** A last-24-hours time with its change from the previous seven days. */
export type ComparedTimeMeasure<Reason extends string = string> =
  TimeMeasure<Reason> & {
    /** Whole percent; negative is faster. Null without both averages. */
    change_from_previous_7_days_percent: number | null
  }

export type ProcessingExclusionReason = "no_placement_time" | "no_handover_time"
export type TransitExclusionReason = "no_pickup_time"
export type ExclusionReason = ProcessingExclusionReason | TransitExclusionReason

/** An average time with the Orders it includes and those it left out, by reason. */
export type TimeMeasure<Reason extends string = string> = {
  period: Period
  included: number
  /** Whole seconds; null when no Order is included, never zero. */
  average_seconds: number | null
  exclusions: { reason: Reason; count: number }[]
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

/** Operator wording for why an Order was left out of a time measure. */
export const exclusionReasonLabels: Record<ExclusionReason, string> = {
  no_placement_time: "no placement time",
  no_handover_time: "no handover time",
  no_pickup_time: "no pickup time",
}

/**
 * A time to the whole minute as people say it: "53 min", "2 h 3 min" or
 * "2 h". Null when there is no average: no Order included is never zero.
 */
export const formatDuration = (seconds: number | null) => {
  if (seconds === null) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/**
 * The last 24 hours against the previous seven days, in words and a tone:
 * a shorter time is faster (good), a longer one slower. The text carries the
 * meaning, so the tone is never the only signal.
 */
export const changeSummary = (
  percent: number | null,
  previousSeconds: number | null,
): { text: string; tone: "faster" | "slower" | "same" | "none" } => {
  const previous = formatDuration(previousSeconds)
  if (percent === null || previous === null)
    return { text: "No previous 7 days to compare with", tone: "none" }
  const against = `the 7-day average of ${previous}`
  if (percent === 0) return { text: `Same as ${against}`, tone: "same" }
  return percent < 0
    ? { text: `${-percent}% faster than ${against}`, tone: "faster" }
    : { text: `${percent}% slower than ${against}`, tone: "slower" }
}

/**
 * The Orders a time measure left out, as one line, largest reason first:
 * "1 excluded: no placement time", "3 excluded: 2 no pickup time, 1 no
 * handover time", or "None excluded".
 */
export const exclusionSummary = (
  exclusions: { reason: ExclusionReason; count: number }[],
) => {
  const present = exclusions
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
  const total = present.reduce((sum, { count }) => sum + count, 0)
  if (total === 0) return "None excluded"
  const reasons =
    present.length === 1
      ? exclusionReasonLabels[present[0].reason]
      : present
          .map(
            ({ reason, count }) => `${count} ${exclusionReasonLabels[reason]}`,
          )
          .join(", ")
  return `${total} excluded: ${reasons}`
}
