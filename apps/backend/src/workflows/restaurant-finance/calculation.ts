import { createHash } from "node:crypto"
import { MathBN } from "@medusajs/framework/utils"
import {
  financialBasisView,
  type PurchasedLine,
  type PurchasedTerms,
} from "../order-operations/financial-basis"
import type { PlacementTimeSource } from "./legacy-basis"

/**
 * The Restaurant finance rules (spec #52 §5, §7; ADR-0006): exact decimal
 * arithmetic on DKK as Medusa stores it, one final rounding per booked
 * amount, and Copenhagen calendar months. Amounts are decimal strings.
 */

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
  /**
   * Present only when legacy reconciliation (#231) rebuilt the basis from
   * the unchanged native Order and the agreement in force at placement,
   * because none was preserved at placement.
   */
  reconstruction?: {
    source: "legacy_reconciliation"
    placed_at: string
    placement_time_source: PlacementTimeSource
  }
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

export {
  FINANCE_TIMEZONE,
  isCalendarMonth,
  copenhagenMonthOf,
  copenhagenDateOf,
  copenhagenMidnight,
  copenhagenMonthPeriod,
} from "../shared/copenhagen-time"

/** A stable identity of what a receipt recognized, independent of when. */
export const payloadDigest = (payload: unknown) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex")

/**
 * A stored bigNumber amount as its exact decimal, never through a JS number
 * (spec #52 §10); the numeric value is only a fallback.
 */
export function exactAmount(record: object, key: string) {
  const values = record as Record<string, unknown>
  const raw = values[`raw_${key}`] as { value?: string } | undefined
  return raw?.value ?? MathBN.convert(values[key] as string).toString()
}
