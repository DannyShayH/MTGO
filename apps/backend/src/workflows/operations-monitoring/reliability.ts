import type { PlacementOutcome } from "../../modules/order-operation/service"
import { ratingSummary } from "../feedback/statistics"
import type { lastThirtyDays } from "../feedback/statistics-period"
import type { Period } from "./volume"

/**
 * Who an Unfulfilled Order's cause lies with (#263), so Customer
 * cancellations read apart from Restaurant and MTOGO causes.
 */
export type CauseGroup = "customer" | "restaurant" | "mtogo"

/**
 * Every way an Order ends without its food handed over, with the party it
 * lies with: each cancellation category, and the delivery outcome
 * `not_delivered` as `delivery_failed` ("failed" names only that outcome).
 * In the order the chart draws them: Customer, Restaurant, then MTOGO.
 */
const UNFULFILLED_CAUSES = [
  { cause: "customer_cancelled", group: "customer" },
  { cause: "restaurant_rejected", group: "restaurant" },
  { cause: "acceptance_timeout", group: "restaurant" },
  { cause: "unassigned_timeout", group: "mtogo" },
  { cause: "operator_cancelled", group: "mtogo" },
  { cause: "delivery_failed", group: "mtogo" },
] as const satisfies readonly { cause: string; group: CauseGroup }[]

const CAUSE_GROUPS: CauseGroup[] = ["customer", "restaurant", "mtogo"]

/** The cause an ended outcome is counted under; `not_delivered` is a failed delivery. */
const causeOf = (outcome: PlacementOutcome) =>
  outcome === "not_delivered" ? "delivery_failed" : outcome

/**
 * The Unfulfilled Order rate (ADR-0015, #263) among the Orders placed in a
 * period: those that ended without handover divided by those that ended, as
 * a percent to one decimal. Orders still open are in neither number and are
 * shown as an exclusion, so recent Orders cannot flatter the rate. No ended
 * Order is no rate, never 0%. Every cause is named, zero when none, and the
 * causes add up to the Unfulfilled Orders because one grouped query gives
 * them all.
 */
export const unfulfilledOrdersFigure = (
  rows: { outcome: PlacementOutcome; count: number }[],
  period: Period,
) => {
  const countOf = (outcome: PlacementOutcome) =>
    rows.find((row) => row.outcome === outcome)?.count ?? 0
  const causes = UNFULFILLED_CAUSES.map(({ cause, group }) => ({
    cause,
    group,
    count: rows
      .filter((row) => causeOf(row.outcome) === cause)
      .reduce((sum, { count }) => sum + count, 0),
  }))
  const unfulfilled = causes.reduce((sum, { count }) => sum + count, 0)
  const stillOpen = countOf("open")
  const ended = unfulfilled + countOf("delivered")
  return {
    period,
    placed: ended + stillOpen,
    ended,
    unfulfilled,
    rate_percent: ended ? Math.round((unfulfilled / ended) * 1000) / 10 : null,
    causes,
    groups: CAUSE_GROUPS.map((group) => ({
      group,
      count: causes
        .filter((cause) => cause.group === group)
        .reduce((sum, { count }) => sum + count, 0),
    })),
    exclusions: [{ reason: "still_open" as const, count: stillOpen }],
  }
}

/**
 * The average Customer rating (#263): #51's platform-wide experience rating
 * for its default last 30 days, from the Feedback module's own statistics
 * read and the same summary the Feedback page shows, so it is never
 * calculated a second way. No ratings is no average, never zero.
 */
export const customerRatingFigure = (
  experience: Record<"experience_rating" | "count", unknown>[],
  { key, from, to }: ReturnType<typeof lastThirtyDays>,
) => {
  const { average, count } = ratingSummary(experience, "experience_rating")
  return {
    period: { key, starts_at: from.toISOString(), ends_at: to.toISOString() },
    average,
    count,
    // Every rating in the period counts; Feedback always has a rating.
    exclusions: [],
  }
}
