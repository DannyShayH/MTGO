import { MedusaError } from "@medusajs/framework/utils"
import {
  copenhagenDateOf,
  copenhagenMidnight,
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../workflows/shared/copenhagen-time"
import {
  daysIn,
  POPULATION_RESTAURANTS,
  type PopulationOutcome,
  type StatementPopulation,
} from "./statement-population-plan"

/**
 * The independently expected statement results of the verification
 * population (#235; spec #52 testing decision 9). Computed from the plan's
 * baskets, menu prices and participation with ADR-0006's published terms in
 * whole hundredths of an øre, never through the finance module's calculation
 * or a statement read, so a reconciliation against the read surfaces can
 * disagree with them.
 */

/** ADR-0006 terms: Danish VAT, marginal commission bands and the monthly fee. */
const VAT_PERCENT = 25n
const COMMISSION_BANDS: { from: bigint; to: bigint | null; percent: bigint }[] =
  [
    { from: 0n, to: 100n, percent: 6n },
    { from: 100n, to: 500n, percent: 5n },
    { from: 500n, to: 1000n, percent: 4n },
    { from: 1000n, to: null, percent: 3n },
  ]
const MONTHLY_FEE_ORE = 10000n

/** Units: 1 DKK = 100 øre = 10 000 hundredths of an øre. */
const HUNDREDTHS_PER_DKK = 10000n

/** Rounds a non-negative amount of hundredths of an øre to øre, halves up. */
const toOre = (hundredths: bigint) => (hundredths + 50n) / 100n

/** Øre as a two-decimal DKK string. */
export const formatOre = (ore: bigint) => {
  const sign = ore < 0n ? "-" : ""
  const absolute = ore < 0n ? -ore : ore
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}

const PRICES = new Map(
  POPULATION_RESTAURANTS.flatMap(({ menu }) =>
    menu.flatMap(({ dishes }) =>
      dishes.map((dish) => [
        dish.handle,
        // Menu prices have at most two decimals; read them as exact øre.
        BigInt(dish.price.toFixed(2).replace(".", "")),
      ]),
    ),
  ),
)

/** Food value excluding VAT, in hundredths of an øre, exact. */
function foodValueExcludingVat(basket: { handle: string; quantity: number }[]) {
  const includingOre = basket.reduce((sum, { handle, quantity }) => {
    const price = PRICES.get(handle)
    if (price === undefined)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Unknown dish ${handle}`,
      )
    return sum + price * BigInt(quantity)
  }, 0n)
  // ore x 100 x 100 / (100 + VAT) hundredths; exact for whole-øre prices.
  return (includingOre * 100n * 100n) / (100n + VAT_PERCENT)
}

/** Marginal commission rounded once, in øre. */
function commissionOre(valueHundredths: bigint) {
  let tenThousandths = 0n
  for (const band of COMMISSION_BANDS) {
    const from = band.from * HUNDREDTHS_PER_DKK
    const to = band.to === null ? valueHundredths : band.to * HUNDREDTHS_PER_DKK
    const upper = valueHundredths < to ? valueHundredths : to
    if (upper > from) tenThousandths += (upper - from) * band.percent
  }
  // percent x hundredths = ten-thousandths of an øre.
  return (tenThousandths + 5000n) / 10000n
}

const CANCELLED: PopulationOutcome[] = [
  "customer_cancelled",
  "restaurant_rejected",
  "acceptance_timeout",
]
const COMPENSATED: PopulationOutcome[] = [
  "unassigned_timeout",
  "operator_cancelled",
]

/** Copenhagen dates of `month` with any active moment, through `lastDay`. */
function activeDateCount(
  changes: StatementPopulation["restaurants"][number]["changes"],
  month: string,
  lastDay: number,
) {
  const [year, number] = month.split("-").map(Number)
  let count = 0
  for (let day = 1; day <= lastDay; day++) {
    const start = copenhagenMidnight(year, number, day)
    const end =
      day === daysIn(month)
        ? copenhagenMonthPeriod(month).ends_at
        : copenhagenMidnight(year, number, day + 1)
    const activeAtStart =
      changes.filter(({ occurred_at }) => occurred_at <= start).at(-1)?.kind ===
      "activated"
    const activatedDuring = changes.some(
      ({ kind, occurred_at }) =>
        kind === "activated" && occurred_at > start && occurred_at < end,
    )
    if (activeAtStart || activatedDuring) count++
  }
  return count
}

/**
 * What one Restaurant's Orders book in `month`: each delivery and
 * compensation in its own month, a late delivery as an adjustment of the
 * anchor month, and cancellations without entitlement counted.
 */
function tallyMonth(
  population: StatementPopulation,
  restaurant: string,
  month: string,
) {
  const tally = {
    foodCredits: 0n,
    funded: 0n,
    commission: 0n,
    adjustments: 0n,
    delivered: 0,
    compensated: 0,
    late: 0,
    without: {} as Record<string, number>,
  }
  for (const order of population.orders) {
    if (order.restaurant !== restaurant) continue
    const isLate = order.outcome === "delivered_late"
    if ((isLate ? population.anchor_month : order.original_month) !== month)
      continue
    const value = foodValueExcludingVat(order.basket)
    const credit = toOre(value)
    if (isLate) {
      tally.late++
      tally.adjustments += credit - commissionOre(value)
    } else if (order.outcome === "delivered") {
      tally.delivered++
      tally.foodCredits += credit
      tally.commission += commissionOre(value)
    } else if (COMPENSATED.includes(order.outcome)) {
      tally.compensated++
      tally.foodCredits += credit
      tally.funded += credit
    } else if (CANCELLED.includes(order.outcome)) {
      tally.without[order.outcome] = (tally.without[order.outcome] ?? 0) + 1
    }
  }
  return tally
}

export type ExpectedStatement = {
  restaurant: string
  month: string
  lifecycle: "closed" | "provisional"
  /**
   * `processing_pending` when a delivery of the month was recognized only
   * after the month closed: its closed statement keeps that warning.
   */
  completeness: "complete" | "processing_pending"
  /** Journal entries posted in the month. */
  entries: number
  delivered: number
  compensated: number
  late_adjustments: number
  without_entitlement: Record<string, number>
  active_date_count: number
  month_day_count: number
  /** Two-decimal DKK, or `unavailable` where the statement withholds it. */
  totals: Record<
    | "food_credits"
    | "mtogo_funded_food_credits"
    | "commission"
    | "service_fee"
    | "adjustments"
    | "balance",
    string
  >
}

/**
 * The expected statement of every population Restaurant and month, and the
 * population summary. Late deliveries post in the anchor month; the current
 * month's fee counts active dates through today.
 */
export function expectedStatementManifest(
  population: StatementPopulation,
  now: Date,
) {
  const currentMonth = copenhagenMonthOf(now)
  const today = Number(copenhagenDateOf(now).slice(8, 10))
  const statements: ExpectedStatement[] = []
  for (const restaurant of population.restaurants) {
    const created = copenhagenMonthOf(restaurant.created_at)
    for (const month of population.months.filter((month) => month >= created)) {
      const tally = tallyMonth(population, restaurant.key, month)
      const days = daysIn(month)
      const active = activeDateCount(
        restaurant.changes,
        month,
        month === currentMonth ? today : days,
      )
      const fee =
        (2n * MONTHLY_FEE_ORE * BigInt(active) + BigInt(days)) /
        (2n * BigInt(days))
      // A late delivery was owed at the close of its month, so that closed
      // statement withholds the delivered totals and the balance.
      const isProcessingPending = population.orders.some(
        (order) =>
          order.restaurant === restaurant.key &&
          order.outcome === "delivered_late" &&
          order.original_month === month &&
          month !== population.anchor_month,
      )
      const withheld = (amount: bigint) =>
        isProcessingPending ? "unavailable" : formatOre(amount)
      statements.push({
        restaurant: restaurant.key,
        month,
        lifecycle: month < currentMonth ? "closed" : "provisional",
        completeness: isProcessingPending ? "processing_pending" : "complete",
        entries: tally.delivered + tally.compensated + tally.late,
        delivered: tally.delivered,
        compensated: tally.compensated,
        late_adjustments: tally.late,
        without_entitlement: tally.without,
        active_date_count: active,
        month_day_count: days,
        totals: {
          food_credits: withheld(tally.foodCredits),
          mtogo_funded_food_credits: withheld(tally.funded),
          commission: withheld(tally.commission),
          service_fee: formatOre(fee),
          adjustments: formatOre(tally.adjustments),
          balance: withheld(
            tally.foodCredits - tally.commission - fee + tally.adjustments,
          ),
        },
      })
    }
  }
  const outcomes: Record<string, number> = {}
  for (const { outcome } of population.orders)
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
  return {
    population: {
      customers: population.customers.length,
      orders: population.orders.length,
      restaurants: population.restaurants.length,
      months: population.months,
      outcomes,
    },
    statements,
  }
}
