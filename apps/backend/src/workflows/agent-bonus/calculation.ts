import { MathBN } from "@medusajs/framework/utils"
import type { JournalEntryKind } from "../../modules/restaurant-finance/models/finance-journal-entry"
import { copenhagenParts } from "../shared/copenhagen-time"

/** Exact points from the purchased food value and recorded pickup (ADR-0010). */
export function calculateBonusPoints(
  foodValueIncludingVat: string,
  pickedUpAt: Date | string,
  agentRating: number | null,
) {
  // Early and late hours are Copenhagen wall-clock hours (Europe/Copenhagen).
  const hour = copenhagenParts(new Date(pickedUpAt)).hour
  const hasTimeBonus = hour < 9 || hour >= 21
  const hasRatingBonus = agentRating === 4 || agentRating === 5
  const foodValueExcludingVat = MathBN.div(foodValueIncludingVat, "1.25")
  let points = foodValueExcludingVat
  if (hasTimeBonus) points = MathBN.mult(points, "1.25")
  if (hasRatingBonus) points = MathBN.mult(points, "1.10")
  // The API's field names (snake_case JSON).
  return {
    food_value: foodValueExcludingVat.toString(),
    time_bonus: hasTimeBonus,
    rating_bonus: hasRatingBonus,
    points: points.toString(),
  }
}

/** The bonus share of a positive funding balance (ADR-0010). */
const POOL_RATE = "0.2"

/**
 * The journal facts funding reads (spec #53 §3), with the stored field
 * names of #52's `finance_journal_entry`.
 */
export type FundingEntry = {
  kind: JournalEntryKind
  /** Exact decimal strings in statement direction. */
  commission: string
  food_credit: string
  funded_by: "customer" | "mtogo"
}

/**
 * A month's funding balance and Bonus pool (spec #53 §3). Commission counts
 * as booked; a refund reaches funding only through the negative commission
 * that reverses it, and only MTOGO-funded food credits are compensation.
 * Service-fee entries and Customer-funded credits are never read. A zero or
 * negative balance gives no pool.
 */
export function calculateBonusFunding(
  entries: FundingEntry[],
  carriedLoss = "0",
) {
  let commission = MathBN.convert(0)
  let reversals = MathBN.convert(0)
  let compensation = MathBN.convert(0)
  for (const entry of entries) {
    if (entry.kind === "service_fee_difference") continue
    if (MathBN.gt(entry.commission, 0))
      commission = MathBN.add(commission, entry.commission)
    else reversals = MathBN.sub(reversals, entry.commission)
    if (entry.funded_by === "mtogo")
      compensation = MathBN.add(compensation, entry.food_credit)
  }
  const balance = MathBN.sub(
    MathBN.sub(MathBN.sub(commission, reversals), compensation),
    carriedLoss,
  )
  return {
    commission: commission.toString(),
    reversals: reversals.toString(),
    compensation: compensation.toString(),
    carried_loss: MathBN.convert(carriedLoss).toString(),
    balance: balance.toString(),
    pool: MathBN.gt(balance, 0)
      ? MathBN.mult(balance, POOL_RATE).toString()
      : null,
  }
}

/** The total of some exact points. */
export const sumPoints = (points: string[]) =>
  points
    .reduce((sum, value) => MathBN.add(sum, value), MathBN.convert(0))
    .toString()

/** Rounds a non-negative amount down to DKK 0.01, never paying more. */
const roundDown = (value: ReturnType<typeof MathBN.convert>) =>
  // bignumber.js ROUND_DOWN (1) truncates towards zero.
  value.decimalPlaces(2, 1).toString()

/**
 * The amount for some points at the exact pool per point (spec #53 §3),
 * rounded down to DKK 0.01: one agent's share or one delivery's
 * explanation. MTOGO retains what rounding leaves of the pool. No pool, or
 * no points to share, gives no amount.
 */
export function calculateBonusAmount(
  pool: string | null,
  allPoints: string,
  points: string,
) {
  if (pool === null || !MathBN.gt(points, 0) || !MathBN.gt(allPoints, 0))
    return null
  return roundDown(MathBN.div(MathBN.mult(pool, points), allPoints))
}
