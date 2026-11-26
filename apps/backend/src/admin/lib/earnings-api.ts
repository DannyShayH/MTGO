import type { StatementHeader, StatementTotal } from "./statement-api"

/**
 * MTOGO's earnings across all Restaurants (#256), as the Admin consumes
 * `GET /admin/earnings` and `GET /admin/earnings/:month`. Every amount is
 * the sum of the Restaurants' statements, DKK excluding VAT, as stored.
 */

export type EarningsTotals = Record<
  "commission" | "service_fee" | "earnings" | "mtogo_funded_food_credits",
  StatementTotal
>

type Restaurant = { id: string; name: string }

export type EarningsSummary = Pick<
  StatementHeader,
  "lifecycle" | "completeness"
> & {
  month: string
  restaurant_count: number
  totals: EarningsTotals
  withheld_restaurants: {
    restaurant: Restaurant
    completeness: Exclude<StatementHeader["completeness"], "complete">
  }[]
}

export type RestaurantEarnings = Pick<
  StatementHeader,
  "lifecycle" | "completeness"
> & {
  restaurant: Restaurant
  totals: EarningsTotals
}

type Contract = {
  timezone: string
  currency_code: string
  amounts_exclude_vat: boolean
  verified_at: string
}

export type EarningsMonths = Contract & {
  months: EarningsSummary[]
  count: number
  limit: number
  offset: number
}

export type EarningsMonth = Contract & {
  /** Covers every Restaurant, whatever page or search is shown. */
  earnings: EarningsSummary
  /** One page of the Restaurants matching the query. */
  restaurants: RestaurantEarnings[]
  count: number
  limit: number
  offset: number
}

/** The recent months the trend shows, newest first. */
export const TREND_MONTHS = 12

export const earningsLabels: Record<keyof EarningsTotals, string> = {
  commission: "Commission",
  service_fee: "Service fee",
  earnings: "MTOGO earnings",
  mtogo_funded_food_credits: "MTOGO-funded food credits",
}

/** A total's amount for geometry only; shown amounts use the exact string. */
export const amountOf = (total: StatementTotal) =>
  total.status === "available" ? Number(total.amount) : null
