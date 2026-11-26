import { MathBN } from "@medusajs/framework/utils"
import type { CancellationCategory } from "../../modules/order-operation/models/order-operation"

/**
 * How finance recognizes a cancelled Order (#229; spec #52 §3, §4;
 * ADR-0006, ADR-0011). Pure: the caller reads the durable facts.
 *
 * - An existing prepared-food credit is recognized once, referencing that
 *   credit, as its full food value excluding VAT funded by MTOGO with zero
 *   commission. Finance never creates another credit or transfer.
 * - Every other supported cancellation is a processed outcome with no
 *   entitlement: no food credit, no commission and no monetary entry.
 * - Anything else is missing evidence, never an inferred entitlement.
 *
 * The original date is the qualifying moment: the authoritative claim
 * deadline for an unassigned timeout, the acceptance deadline for an
 * acceptance timeout (or its processing when a legacy Order has none),
 * otherwise the recorded cancellation. Posting time is decided later.
 */

/** Cancellations that can owe a prepared-food credit. */
const COMPENSATED: CancellationCategory[] = [
  "unassigned_timeout",
  "operator_cancelled",
]

type When = Date | string

export type CancellationFacts = {
  order_id: string
  category: CancellationCategory | null
  cancelled_at: When
  acceptance_deadline: When | null
  /** The delivery's authoritative claim deadline, when it had accepted work. */
  claim_deadline: When | null
  food_credit: {
    id: string
    /** Exact decimal string, excluding VAT. */
    amount: string
    commission_amount: string
    currency_code: string
    funded_by: string
    reason: string
    preparation_started_at: When
    ready_at: When | null
  } | null
}

export type CancellationSource =
  | { kind: "prepared_food_credit"; id: string }
  | { kind: "order_cancelled"; id: string }

export type CancellationRecognition =
  | {
      status: "compensation"
      source: { kind: "prepared_food_credit"; id: string }
      outcome: CancellationCategory
      occurred_at: Date
      currency_code: string
      food_credit: string
      commission: "0"
      funded_by: "mtogo"
      evidence: Record<string, string | null>
    }
  | {
      status: "no_entitlement"
      source: { kind: "order_cancelled"; id: string }
      outcome: CancellationCategory
      occurred_at: Date
      evidence: Record<string, string | null>
    }
  | {
      status: "evidence_missing"
      source: CancellationSource
      /** The recorded cancellation, the only date known for certain. */
      occurred_at: Date
    }

const iso = (value: When | null) =>
  value === null ? null : new Date(value).toISOString()

/** The qualifying moment of a category, or null when it is not recorded. */
function qualifyingAt(facts: CancellationFacts): Date | null {
  switch (facts.category) {
    case "unassigned_timeout":
      return facts.claim_deadline ? new Date(facts.claim_deadline) : null
    case "acceptance_timeout":
      return new Date(facts.acceptance_deadline ?? facts.cancelled_at)
    case null:
      return null
    default:
      return new Date(facts.cancelled_at)
  }
}

export function cancellationRecognition(
  facts: CancellationFacts,
): CancellationRecognition {
  const credit = facts.food_credit
  const source: CancellationSource = credit
    ? { kind: "prepared_food_credit", id: credit.id }
    : { kind: "order_cancelled", id: facts.order_id }
  const missing = {
    status: "evidence_missing" as const,
    source,
    occurred_at: new Date(facts.cancelled_at),
  }
  const category = facts.category
  const occurred_at = qualifyingAt(facts)
  if (!category || !occurred_at) return missing
  if (!credit)
    return {
      status: "no_entitlement",
      source: { kind: "order_cancelled", id: facts.order_id },
      outcome: category,
      occurred_at,
      evidence: {
        cancellation_category: category,
        cancelled_at: iso(facts.cancelled_at),
        qualifying_at: occurred_at.toISOString(),
      },
    }
  if (
    !COMPENSATED.includes(category) ||
    credit.reason !== category ||
    credit.funded_by !== "mtogo" ||
    !MathBN.eq(credit.commission_amount, 0)
  )
    return missing
  return {
    status: "compensation",
    source: { kind: "prepared_food_credit", id: credit.id },
    outcome: category,
    occurred_at,
    currency_code: credit.currency_code,
    food_credit: credit.amount,
    commission: "0",
    funded_by: "mtogo",
    evidence: {
      food_credit_id: credit.id,
      cancellation_category: category,
      cancelled_at: iso(facts.cancelled_at),
      claim_deadline: iso(facts.claim_deadline),
      preparation_started_at: iso(credit.preparation_started_at),
      ready_at: iso(credit.ready_at),
      food_value_excluding_vat: credit.amount,
      commission: "0",
    },
  }
}
