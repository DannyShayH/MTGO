import { MathBN } from "@medusajs/framework/utils"
import type { OrderOperationState } from "../../modules/order-operation/models/order-operation"
import { isActiveOrderState } from "../delivery/assignment-rules"

/** The project's VAT assumption on menu prices, which include it (ADR-0006). */
export const VAT_RATE = "0.25"

export type UnassignedCancellationDecision =
  | { outcome: "cancel"; category: "unassigned_timeout" }
  | { outcome: "already_cancelled" }
  | {
      outcome: "refused"
      code:
        | "order_not_accepted"
        | "delivery_unavailable"
        | "delivery_assigned"
        | "claim_window_open"
    }

type OrderFacts = {
  state: OrderOperationState
  accepted_at: Date | string | null | undefined
}

/** The delivery's durable deadline and responsibility, read under the Order's guard. */
export type UnassignedDeliveryFacts = {
  claim_deadline: Date | string
  assigned_agent_id: string | null
} | null

/**
 * Whether accepted work is cancelled because it is still unassigned at
 * acceptance plus thirty minutes (#162; spec #48 stories 43-45; ADR-0011).
 * The delivery's claim deadline is derived from the durable acceptance time
 * and is the same boundary the claim rule refuses at, so exactly at it the
 * work is cancelled and never claimed. A recorded cancellation is the current
 * outcome; an earlier successful assignment always prevents this one.
 */
export function decideUnassignedCancellation(
  order: OrderFacts,
  delivery: UnassignedDeliveryFacts,
  now: Date,
): UnassignedCancellationDecision {
  if (order.state === "cancelled") return { outcome: "already_cancelled" }
  if (!order.accepted_at || !isActiveOrderState(order.state))
    return { outcome: "refused", code: "order_not_accepted" }
  if (!delivery) return { outcome: "refused", code: "delivery_unavailable" }
  if (delivery.assigned_agent_id)
    return { outcome: "refused", code: "delivery_assigned" }
  if (now.getTime() < new Date(delivery.claim_deadline).getTime())
    return { outcome: "refused", code: "claim_window_open" }
  return { outcome: "cancel", category: "unassigned_timeout" }
}

/** A purchased line as Query returns it: Medusa's raw unit price incl. VAT. */
export type PurchasedLine = {
  raw_unit_price: { value: string } | string | number
  quantity: number | string
}

type PreparationEvidence = {
  restaurant_id: string
  preparation_started_at: Date | null
  ready_at: Date | null
}

export type PreparedFoodCredit = {
  restaurant_id: string
  /** Full food value excluding VAT, as an exact decimal string. */
  amount: string
  currency_code: string
  preparation_started_at: Date
  ready_at: Date | null
}

/**
 * The MTOGO-funded food credit owed when delivery capacity fails after food
 * preparation (ADR-0006, ADR-0011): the full purchased food value excluding
 * VAT, with no commission, rounded once to two decimals with halves away from
 * zero. The preparation start (#146) recorded strictly before the claim
 * deadline is the evidence of prepared food; mere acceptance, or food started
 * after the work was already due to be cancelled, owes nothing.
 */
export function preparedFoodCredit(
  order: PreparationEvidence,
  lines: PurchasedLine[],
  currency_code: string,
  claim_deadline: Date | string,
): PreparedFoodCredit | null {
  if (
    !order.preparation_started_at ||
    new Date(order.preparation_started_at).getTime() >=
      new Date(claim_deadline).getTime()
  )
    return null
  const including = lines.reduce<ReturnType<typeof MathBN.convert>>(
    (total, { raw_unit_price, quantity }) =>
      MathBN.add(
        total,
        MathBN.mult(
          typeof raw_unit_price === "object"
            ? raw_unit_price.value
            : raw_unit_price,
          quantity,
        ),
      ),
    MathBN.convert(0),
  )
  // bignumber.js ROUND_HALF_UP (4) rounds halves away from zero.
  const amount = MathBN.div(including, MathBN.add(1, VAT_RATE))
    .decimalPlaces(2, 4)
    .toString()
  return {
    restaurant_id: order.restaurant_id,
    amount,
    currency_code,
    preparation_started_at: order.preparation_started_at,
    ready_at: order.ready_at,
  }
}

/** What the guarded commit found, as the sweep and the claim report it. */
export type UnassignedDeadlineOutcome =
  | Exclude<UnassignedCancellationDecision, { outcome: "cancel" }>
  | { outcome: "not_found" }
  | { outcome: "changed" }
  | { outcome: "cancelled"; has_food_credit: boolean }
