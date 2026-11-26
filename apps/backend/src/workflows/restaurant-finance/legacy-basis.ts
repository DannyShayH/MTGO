import {
  captureFinancialBasis,
  isKnownTermsVersion,
  type PlacedOrder,
  type StoredFinancialBasis,
} from "../order-operations/financial-basis"

/**
 * Legacy reconciliation of a purchase basis (#231; spec #52 §2, §9). An
 * Order placed before #226 preserved its basis has none stored. It may be
 * reconstructed only from facts that prove the purchase and the terms in
 * force when it was placed:
 *
 * - the purchase: the native Order still at its first version, so its lines
 *   are the lines bought, each with an exact VAT-inclusive price and
 *   quantity. A changed Order's current lines are not the purchase;
 * - the terms: the one agreement recorded no later than placement and not
 *   removed before it, of a known terms version. Today's agreement, recorded
 *   later, is not proof of what applied then.
 *
 * Whatever cannot be established is named, never guessed from today's menu
 * or agreement.
 */

export type LegacyEvidence = "purchase" | "terms"

/** Where a legacy placement time comes from. */
export type PlacementTimeSource = "paid_placement" | "order_created"

export type LegacyAgreement = {
  id: string
  terms_version: string
  agreed_at: Date | string
  /** Removed agreements stay soft-deleted (ADR-0014). */
  deleted_at?: Date | string | null
}

export type LegacyBasis =
  | {
      status: "verified"
      basis: StoredFinancialBasis
      /** The placement time the terms were matched against. */
      placed_at: string
      placement_time_source: PlacementTimeSource
    }
  | { status: "unverifiable"; missing: LegacyEvidence[] }

/** The version a native Order is created with: the one its Customer paid. */
export const ORIGINAL_ORDER_VERSION = 1

/** A stored amount as exact decimal text, or null when it is not one. */
const EXACT_DECIMAL = /^\d+(\.\d+)?$/
const isExactDecimal = (value: unknown) => {
  const raw =
    value && typeof value === "object"
      ? (value as { value?: unknown }).value
      : value
  return (
    (typeof raw === "string" || typeof raw === "number") &&
    EXACT_DECIMAL.test(String(raw))
  )
}

/**
 * The lines bought, or null when they no longer show the purchase exactly:
 * lines of a later version, an Order edited after placement (an edit can
 * change a line's price), or a line without an exact VAT-inclusive price and
 * quantity.
 */
function purchasedOrder(
  order: PlacedOrder & { edited: boolean },
): PlacedOrder | null {
  if (
    order.version !== ORIGINAL_ORDER_VERSION ||
    order.edited ||
    !order.items.length
  )
    return null
  const isExact = order.items.every(
    (item) =>
      isExactDecimal(item.raw_unit_price) &&
      isExactDecimal(item.quantity) &&
      item.is_tax_inclusive === true,
  )
  return isExact ? order : null
}

/** The one agreement in force at `at`, or null when that is not established. */
function agreementAt(agreements: LegacyAgreement[], at: Date) {
  const inForce = agreements.filter(
    (agreement) =>
      new Date(agreement.agreed_at) <= at &&
      (!agreement.deleted_at || new Date(agreement.deleted_at) > at),
  )
  return inForce.length === 1 ? inForce[0] : null
}

/**
 * Reconstructs a legacy purchase basis from verifiable facts only, or names
 * each fact that cannot be verified: `purchase` (what was bought and at
 * which price) or `terms` (the one known agreement in force at placement).
 * The placement time is the placement record's or, when it has none, the
 * native Order's creation.
 */
export function legacyFinancialBasis(input: {
  /** The original version's lines, and whether the Order was edited since. */
  order: PlacedOrder & { created_at: Date | string; edited: boolean }
  /** The placement record's time; legacy records may not have one. */
  placed_at: Date | string | null
  /** Every agreement the Restaurant ever had, removed ones included. */
  agreements: LegacyAgreement[]
}): LegacyBasis {
  const placed_at = new Date(input.placed_at ?? input.order.created_at)
  const purchase = purchasedOrder(input.order)
  const agreement = agreementAt(input.agreements, placed_at)
  const terms =
    agreement && isKnownTermsVersion(agreement.terms_version) ? agreement : null
  const basis = purchase && terms && captureFinancialBasis(purchase, terms)
  if (!basis) {
    const missing: LegacyEvidence[] = []
    // Both facts present yet no basis: the purchase did not reproduce.
    if (!purchase || terms) missing.push("purchase")
    if (!terms) missing.push("terms")
    return { status: "unverifiable", missing }
  }
  return {
    status: "verified",
    basis,
    placed_at: placed_at.toISOString(),
    placement_time_source: input.placed_at ? "paid_placement" : "order_created",
  }
}
