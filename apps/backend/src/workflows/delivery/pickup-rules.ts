import type { PickupFacts } from "../../modules/delivery/service"
import { isActiveOrderState } from "./assignment-rules"

/** Refusals because of the delivery, the Order or the agent (`NOT_ALLOWED`, 400). */
export const PICKUP_REFUSALS = [
  "food_not_ready",
  "delivery_not_responsible",
  "delivery_not_active",
] as const

/** Refusals because another request already holds the state (`CONFLICT`, 409). */
export const PICKUP_CONFLICTS = [
  "pickup_request_reused",
  "delivery_changed",
] as const

export type PickupRefusal =
  | (typeof PICKUP_REFUSALS)[number]
  | (typeof PICKUP_CONFLICTS)[number]
  | "delivery_agent_not_authorized"

export type PickupDecision =
  | { outcome: "pick_up" }
  | { outcome: "already_picked_up" }
  | { outcome: "refused"; code: PickupRefusal }

/** Read under the agent's and the Order's locks and the delivery row lock. */
export type { PickupFacts }

/**
 * The pickup rule (#160; spec #48 stories 32-35). Only the responsible,
 * authorized agent of an active delivery may record collection, and only
 * after the Restaurant recorded the food ready. A recorded pickup is
 * returned unchanged, so a double tap or a lost response never moves its
 * time; a terminal outcome still wins over such a repeat. A retry identity
 * belongs to the delivery and agent it was first used for.
 */
export function decidePickup(facts: PickupFacts): PickupDecision {
  const { agent, delivery, order, request_holder } = facts
  const refuse = (code: PickupRefusal): PickupDecision => ({
    outcome: "refused",
    code,
  })
  if (
    request_holder &&
    (request_holder.order_id !== delivery.order_id ||
      request_holder.agent_id !== agent.id)
  )
    return refuse("pickup_request_reused")
  if (agent.status !== "authorized")
    return refuse("delivery_agent_not_authorized")
  if (delivery.assigned_agent_id !== agent.id)
    return refuse("delivery_not_responsible")
  if (!isActiveOrderState(order.state) || delivery.active_agent_id !== agent.id)
    return refuse("delivery_not_active")
  if (delivery.picked_up_at) return { outcome: "already_picked_up" }
  if (order.state !== "ready" || !order.ready_at)
    return refuse("food_not_ready")
  return { outcome: "pick_up" }
}
