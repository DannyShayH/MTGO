import { MathBN } from "@medusajs/framework/utils"
import { COMMON_MVP_TERMS_V1 } from "../restaurants/commercial-terms"
import { VAT_RATE } from "./unassigned-cancellation-rules"

/**
 * The purchased financial basis of a paid Order (#226, spec #52 §2): what a
 * later Restaurant statement needs to reproduce its food value and charges,
 * frozen at paid placement so a later menu-price or policy change never
 * rewrites it. Amounts are exact decimal strings, never floats.
 */

/** The terms each recorded version stands for; only the common MVP terms exist (ADR-0006). */
const TERMS_BY_VERSION: Record<string, typeof COMMON_MVP_TERMS_V1> = {
  [COMMON_MVP_TERMS_V1.terms_version]: COMMON_MVP_TERMS_V1,
}

/** Whether a recorded terms version names terms this release can reproduce. */
export const isKnownTermsVersion = (terms_version: string) =>
  Object.prototype.hasOwnProperty.call(TERMS_BY_VERSION, terms_version)

/** Stored JSON is untrusted, so a raw value's `value` may be missing. */
type Decimal = { value?: string | null } | string | number

/** Medusa's raw `{ value }`, a decimal string or a whole number, as exact text. */
const decimal = (value: Decimal | null | undefined) => {
  const raw = typeof value === "object" ? value?.value : value
  return raw === undefined || raw === null
    ? null
    : MathBN.convert(raw).toString()
}

/** An Order line as Query reads it at placement: Medusa's raw price incl. VAT. */
export type PlacedOrderLine = {
  id: string
  variant_id?: string | null
  raw_unit_price?: Decimal | null
  /** Menu prices include VAT (ADR-0012); a line saying otherwise is not reproducible. */
  is_tax_inclusive?: boolean | null
  /** Whole units: Medusa keeps the line's quantity on its Order item. */
  quantity?: Decimal | null
}

export type PlacedOrder = {
  version: number
  currency_code: string
  items: PlacedOrderLine[]
}

/** The Restaurant's agreement in force at placement. */
export type PlacementAgreement = {
  id: string
  terms_version: string
  agreed_at: Date | string
}

export type PurchasedTerms = {
  terms_version: string
  agreement_id: string
  agreed_at: string
  prices_include_vat: true
  vat_rate: string
  commission_tiers: {
    from_amount: string
    to_amount: string | null
    rate_percent: string
  }[]
  monthly_service_fee: { amount: string; currency_code: string }
}

export type PurchasedLine = {
  line_item_id: string
  variant_id: string | null
  quantity: string
  unit_price_including_vat: string
}

/** What the placement record stores; version 1 of its shape. */
export type StoredFinancialBasis = {
  basis_version: 1
  currency_code: string
  order_version: number
  terms: PurchasedTerms
  lines: PurchasedLine[]
}

/**
 * The basis to freeze at placement, or null when the facts to reproduce it
 * are incomplete. Null never fails placement: the basis then shows as
 * unavailable instead of being guessed from today's menu or terms.
 */
export function captureFinancialBasis(
  order: PlacedOrder,
  agreement: PlacementAgreement | null,
): StoredFinancialBasis | null {
  const terms = agreement && TERMS_BY_VERSION[agreement.terms_version]
  if (!agreement || !terms || !order.items.length) return null
  const lines: PurchasedLine[] = []
  for (const item of order.items) {
    const unit = decimal(item.raw_unit_price)
    const quantity = decimal(item.quantity)
    if (unit === null || quantity === null || item.is_tax_inclusive !== true)
      return null
    lines.push({
      line_item_id: item.id,
      variant_id: item.variant_id ?? null,
      quantity,
      unit_price_including_vat: unit,
    })
  }
  return {
    basis_version: 1,
    currency_code: order.currency_code,
    order_version: order.version,
    terms: {
      terms_version: terms.terms_version,
      agreement_id: agreement.id,
      agreed_at: new Date(agreement.agreed_at).toISOString(),
      prices_include_vat: true,
      vat_rate: VAT_RATE,
      commission_tiers: terms.commission_tiers.map((tier) => ({
        from_amount: String(tier.from_amount),
        to_amount: tier.to_amount === null ? null : String(tier.to_amount),
        rate_percent: String(tier.rate_percent),
      })),
      monthly_service_fee: {
        amount: String(terms.monthly_service_fee.amount),
        currency_code: terms.monthly_service_fee.currency_code,
      },
    },
    lines,
  }
}

/** What staff see: the preserved basis, or that none can be shown. */
export type FinancialBasisView =
  | {
      status: "preserved"
      restaurant_id: string
      placed_at: string
      currency_code: string
      order_version: number
      terms: PurchasedTerms
      lines: (PurchasedLine & { total_including_vat: string })[]
      food_value_including_vat: string
      /** Exact, unrounded: rounding belongs to a later recognized amount. */
      food_value_excluding_vat: string
    }
  | { status: "unavailable" }

const isStoredBasis = (value: unknown): value is StoredFinancialBasis => {
  const basis = value as Partial<StoredFinancialBasis> | null
  return (
    !!basis &&
    !Array.isArray(basis) &&
    basis.basis_version === 1 &&
    typeof basis.currency_code === "string" &&
    typeof basis.order_version === "number" &&
    !!basis.terms &&
    typeof basis.terms.vat_rate === "string" &&
    Array.isArray(basis.lines) &&
    basis.lines.length > 0 &&
    basis.lines.every(
      (line) =>
        typeof line?.quantity === "string" &&
        typeof line.unit_price_including_vat === "string",
    )
  )
}

/**
 * The disclosure of a stored basis. A missing or damaged basis, or one
 * without its placement time, is unavailable: nothing is backfilled.
 */
export function financialBasisView(
  stored: unknown,
  placement: { restaurant_id: string; placed_at: Date | string | null },
): FinancialBasisView {
  if (!isStoredBasis(stored) || !placement.placed_at)
    return { status: "unavailable" }
  const lines = stored.lines.map((line) => ({
    ...line,
    total_including_vat: MathBN.mult(
      line.unit_price_including_vat,
      line.quantity,
    ).toString(),
  }))
  const including = lines.reduce(
    (total, line) => MathBN.add(total, line.total_including_vat),
    MathBN.convert(0),
  )
  return {
    status: "preserved",
    restaurant_id: placement.restaurant_id,
    placed_at: new Date(placement.placed_at).toISOString(),
    currency_code: stored.currency_code,
    order_version: stored.order_version,
    terms: stored.terms,
    lines,
    food_value_including_vat: including.toString(),
    food_value_excluding_vat: MathBN.div(
      including,
      MathBN.add(1, stored.terms.vat_rate),
    ).toString(),
  }
}
