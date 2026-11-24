import { MathBN } from "@medusajs/framework/utils"
import {
  financialBasisView,
  type PurchasedLine,
  type PurchasedTerms,
} from "../order-operations/financial-basis"

/**
 * The Restaurant finance rules (spec #52 §5, §7; ADR-0006): exact decimal
 * arithmetic on DKK as Medusa stores it, one final rounding per booked
 * amount, and Copenhagen calendar months. Amounts are decimal strings.
 */

export const FINANCE_TIMEZONE = "Europe/Copenhagen"

type Amount = string | number

/** Rounds a final amount once to two decimals, ties away from zero. */
export const roundMoney = (value: Amount) =>
  // bignumber.js ROUND_HALF_UP (4) rounds halves away from zero.
  MathBN.convert(value).decimalPlaces(2, 4).toString()

/**
 * Marginal commission on an exact food value excluding VAT: each tier's
 * rate applies only to the part of the value inside that tier. Rounded once.
 */
export function marginalCommission(
  food_value_excluding_vat: Amount,
  tiers: PurchasedTerms["commission_tiers"],
) {
  const value = MathBN.convert(food_value_excluding_vat)
  let commission = MathBN.convert(0)
  for (const tier of tiers) {
    const upper =
      tier.to_amount === null ? value : MathBN.min(value, tier.to_amount)
    const inTier = MathBN.sub(upper, tier.from_amount)
    if (MathBN.lte(inTier, 0)) continue
    commission = MathBN.add(
      commission,
      MathBN.div(MathBN.mult(inTier, tier.rate_percent), 100),
    )
  }
  return roundMoney(commission.toString())
}

/**
 * The reversal of a booked commission: exactly the original amount with the
 * opposite sign, never recomputed from current terms (spec #52 §4, §5).
 */
export const reverseCommission = (original_commission: Amount) =>
  MathBN.mult(original_commission, -1).toString()

export type RecognitionEvidence = {
  terms_version: string
  agreement_id: string
  order_version: number
  vat_rate: string
  commission_tiers: PurchasedTerms["commission_tiers"]
  food_value_including_vat: string
  food_value_excluding_vat: string
  lines: (PurchasedLine & { total_including_vat: string })[]
}

export type DeliveredRecognition =
  | {
      status: "recognizable"
      currency_code: string
      /** Full purchased food value excluding VAT, rounded once. */
      food_credit: string
      /** Marginal commission on the exact food value, rounded once. */
      commission: string
      evidence: RecognitionEvidence
    }
  | { status: "missing_financial_basis" }

/**
 * What a successful handover earns (spec #52 §4): the full purchased food
 * value excluding VAT as food credit and the marginal commission, each
 * computed independently from the exact value preserved at paid placement.
 * Without a preserved basis nothing is guessed from today's menu or terms.
 */
export function deliveredRecognition(
  stored_basis: unknown,
  placement: { restaurant_id: string; placed_at: Date | string | null },
): DeliveredRecognition {
  const basis = financialBasisView(stored_basis, placement)
  if (basis.status !== "preserved") return { status: "missing_financial_basis" }
  return {
    status: "recognizable",
    currency_code: basis.currency_code,
    food_credit: roundMoney(basis.food_value_excluding_vat),
    commission: marginalCommission(
      basis.food_value_excluding_vat,
      basis.terms.commission_tiers,
    ),
    evidence: {
      terms_version: basis.terms.terms_version,
      agreement_id: basis.terms.agreement_id,
      order_version: basis.order_version,
      vat_rate: basis.terms.vat_rate,
      commission_tiers: basis.terms.commission_tiers,
      food_value_including_vat: basis.food_value_including_vat,
      food_value_excluding_vat: basis.food_value_excluding_vat,
      lines: basis.lines,
    },
  }
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Whether a value is a real `YYYY-MM` calendar month. */
export const isCalendarMonth = (value: string) => MONTH_PATTERN.test(value)

const copenhagenParts = (instant: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FINANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value)
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  }
}

/** The Copenhagen calendar month an instant falls in, as `YYYY-MM`. */
export function copenhagenMonthOf(instant: Date | string) {
  const { year, month } = copenhagenParts(new Date(instant))
  return `${year}-${String(month).padStart(2, "0")}`
}

/** The instant of Copenhagen midnight starting the given day. */
function copenhagenMidnight(year: number, month: number) {
  // Copenhagen changes its offset at 02:00/03:00 on a Sunday, never at the
  // first midnight of a month, so the offset at a UTC guess is exact.
  const guess = Date.UTC(year, month - 1, 1)
  const local = copenhagenParts(new Date(guess))
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  )
  return new Date(guess - (asUtc - guess))
}

/**
 * A month's period: from its Copenhagen start, inclusive, to the next
 * month's start, exclusive.
 */
export function copenhagenMonthPeriod(month: string) {
  const [year, number] = month.split("-").map(Number)
  return {
    starts_at: copenhagenMidnight(year, number),
    ends_at:
      number === 12
        ? copenhagenMidnight(year + 1, 1)
        : copenhagenMidnight(year, number + 1),
  }
}
