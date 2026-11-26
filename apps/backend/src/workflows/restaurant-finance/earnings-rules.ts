import { MathBN } from "@medusajs/framework/utils"
import {
  available,
  type Completeness,
  type Lifecycle,
  type Total,
  type UnavailableReason,
} from "./statement-rules"

/**
 * What MTOGO earned in a Copenhagen month across all Restaurants (#256).
 * It only adds up the Restaurants' statement summaries from the shared
 * read: no second calculation, so Admin earnings always equal the sum of
 * the statements staff see. A total any Restaurant withholds is withheld
 * for all of them, never shown as a partial sum.
 */

/** One Restaurant's statement for the month, as the shared read gives it. */
export type RestaurantStatementSummary = {
  restaurant: { id: string; name: string }
  lifecycle: Lifecycle
  completeness: Completeness
  totals: Record<"commission" | "service_fee", Total>
  mtogo_funded_food_credits: Total
}

export type EarningsTotals = Record<
  "commission" | "service_fee" | "earnings" | "mtogo_funded_food_credits",
  Total
>

export type RestaurantEarnings = {
  restaurant: { id: string; name: string }
  lifecycle: Lifecycle
  completeness: Completeness
  totals: EarningsTotals
}

export type EarningsSummary = {
  month: string
  lifecycle: Lifecycle
  completeness: Completeness
  restaurant_count: number
  totals: EarningsTotals
  /** Every Restaurant whose statement for the month is not complete. */
  withheld_restaurants: {
    restaurant: { id: string; name: string }
    completeness: Exclude<Completeness, "complete">
  }[]
}

/** Missing evidence does not resolve by waiting, so it is named first. */
const REASON_ORDER: UnavailableReason[] = [
  "evidence_missing",
  "processing_pending",
  "not_yet_supported",
  "depends_on_unavailable",
]

const COMPLETENESS_ORDER: Completeness[] = [
  "incomplete",
  "processing_pending",
  "complete",
]

/** The sum of every total, or the most serious reason one is withheld. */
function sumTotals(totals: Total[]): Total {
  const reasons = totals.flatMap((total) =>
    total.status === "unavailable" ? [total.reason] : [],
  )
  if (reasons.length) {
    const reason = REASON_ORDER.find((candidate) => reasons.includes(candidate))
    return { status: "unavailable", reason: reason ?? reasons[0] }
  }
  return available(
    totals.reduce(
      (sum, total) => MathBN.add(sum, (total as { amount: string }).amount),
      MathBN.convert(0),
    ),
  )
}

/** Earnings are commission plus service fee, known only when both are. */
function withEarnings(
  totals: Pick<
    EarningsTotals,
    "commission" | "service_fee" | "mtogo_funded_food_credits"
  >,
): EarningsTotals {
  const isKnown =
    totals.commission.status === "available" &&
    totals.service_fee.status === "available"
  return {
    commission: totals.commission,
    service_fee: totals.service_fee,
    earnings: isKnown
      ? sumTotals([totals.commission, totals.service_fee])
      : { status: "unavailable", reason: "depends_on_unavailable" },
    mtogo_funded_food_credits: totals.mtogo_funded_food_credits,
  }
}

export function earningsOfMonth(
  month: string,
  lifecycle: Lifecycle,
  statements: RestaurantStatementSummary[],
): { summary: EarningsSummary; restaurants: RestaurantEarnings[] } {
  const restaurants = statements.map((statement) => ({
    restaurant: statement.restaurant,
    lifecycle: statement.lifecycle,
    completeness: statement.completeness,
    totals: withEarnings({
      ...statement.totals,
      mtogo_funded_food_credits: statement.mtogo_funded_food_credits,
    }),
  }))
  const column = (
    key: "commission" | "service_fee" | "mtogo_funded_food_credits",
  ) => sumTotals(restaurants.map(({ totals }) => totals[key]))
  const completeness =
    COMPLETENESS_ORDER.find((candidate) =>
      statements.some((statement) => statement.completeness === candidate),
    ) ?? "complete"
  return {
    summary: {
      month,
      lifecycle,
      completeness,
      restaurant_count: statements.length,
      totals: withEarnings({
        commission: column("commission"),
        service_fee: column("service_fee"),
        mtogo_funded_food_credits: column("mtogo_funded_food_credits"),
      }),
      withheld_restaurants: statements.flatMap(
        ({ restaurant, completeness }) =>
          completeness === "complete" ? [] : [{ restaurant, completeness }],
      ),
    },
    restaurants,
  }
}

/**
 * A Restaurant's statement reduced to what Earnings adds up. A closure
 * stores this alongside its snapshot, so a closed month is read without its
 * entries; both come from the same statement, so they always agree.
 */
export function statementSummary(statement: {
  restaurant: { id: string; name: string }
  lifecycle: Lifecycle
  completeness: Completeness
  totals: Record<"commission" | "service_fee", Total>
  mtogo_funded_food_credits: Total
}): RestaurantStatementSummary {
  return {
    restaurant: {
      id: statement.restaurant.id,
      name: statement.restaurant.name,
    },
    lifecycle: statement.lifecycle,
    completeness: statement.completeness,
    totals: {
      commission: statement.totals.commission,
      service_fee: statement.totals.service_fee,
    },
    mtogo_funded_food_credits: statement.mtogo_funded_food_credits,
  }
}

export const EARNINGS_ORDER_FIELDS = [
  "earnings",
  "commission",
  "service_fee",
  "mtogo_funded_food_credits",
  "name",
] as const
export type EarningsOrderField = (typeof EARNINGS_ORDER_FIELDS)[number]

export type RestaurantPageQuery = {
  /** A field, descending with a leading `-`; most earning first by default. */
  order?: EarningsOrderField | `-${EarningsOrderField}`
  q?: string
  completeness?: readonly Completeness[]
  limit: number
  offset: number
}

/** Compares two known amounts exactly, never through binary floats. */
const compareAmounts = (a: string, b: string) => {
  if (MathBN.lt(a, b)) return -1
  return MathBN.gt(a, b) ? 1 : 0
}

const byName = (a: RestaurantEarnings, b: RestaurantEarnings) =>
  a.restaurant.name.localeCompare(b.restaurant.name, "en") ||
  a.restaurant.id.localeCompare(b.restaurant.id)

/**
 * One page of a month's Restaurants: searched by name, filtered by
 * completeness and sorted. A withheld amount is unknown, so it is never
 * ranked as a number: those Restaurants come last in either direction. Ties
 * and withheld rows keep name order. `count` is the matching rows.
 */
export function restaurantPage(
  rows: RestaurantEarnings[],
  query: RestaurantPageQuery,
) {
  const order = query.order ?? "-earnings"
  const isDescending = order.startsWith("-")
  const field = (isDescending ? order.slice(1) : order) as EarningsOrderField
  const direction = isDescending ? -1 : 1
  const search = query.q?.trim().toLocaleLowerCase("en")
  const matching = rows.filter(
    ({ restaurant, completeness }) =>
      (!search || restaurant.name.toLocaleLowerCase("en").includes(search)) &&
      (!query.completeness?.length ||
        query.completeness.includes(completeness)),
  )
  const sorted = [...matching].sort((a, b) => {
    if (field === "name") return direction * byName(a, b)
    const [left, right] = [a.totals[field], b.totals[field]]
    if (left.status !== right.status)
      return left.status === "unavailable" ? 1 : -1
    if (left.status === "available" && right.status === "available")
      return (
        direction * compareAmounts(left.amount, right.amount) || byName(a, b)
      )
    return byName(a, b)
  })
  return {
    restaurants: sorted.slice(query.offset, query.offset + query.limit),
    count: matching.length,
  }
}
