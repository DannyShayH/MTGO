import type { AssignmentFacts } from "../../modules/delivery/service"

/** Unassigned work can be claimed strictly before acceptance plus thirty minutes. */
export const CLAIM_WINDOW_MS = 30 * 60 * 1000

/** Accepted, nonterminal Order states: preparation does not gate claiming. */
export const ACTIVE_ORDER_STATES = ["accepted", "preparing", "ready"] as const

export const isActiveOrderState = (state: string) =>
  (ACTIVE_ORDER_STATES as readonly string[]).includes(state)

/** Refusals because of the delivery, the Order or the agent (`NOT_ALLOWED`, 400). */
export const ASSIGNMENT_REFUSALS = [
  "delivery_not_active",
  "claim_deadline_passed",
  "delivery_outside_approved_areas",
  "delivery_agent_not_authorized",
] as const

/** Refusals because another responsibility already holds it (`CONFLICT`, 409). */
export const ASSIGNMENT_CONFLICTS = [
  "delivery_already_assigned",
  "delivery_agent_has_active_delivery",
  "assignment_request_reused",
] as const

export type AssignmentRefusal =
  (typeof ASSIGNMENT_REFUSALS)[number] | (typeof ASSIGNMENT_CONFLICTS)[number]

export type AssignmentDecision =
  | { outcome: "assign" }
  | { outcome: "already_assigned" }
  | { outcome: "refused"; code: AssignmentRefusal }

/** Read under the agent row lock and the Order's lock, at the server's time. */
export type { AssignmentFacts }

/**
 * The one assignment rule shared by an agent's claim and an operator's
 * initial assignment (spec #48 stories 22-28, 44, 45). The responsible
 * agent's repeat returns the original assignment, even after the deadline
 * or an area change, so a double tap or lost response never creates new
 * work or fails a committed claim, unless the Order is no longer active.
 * A retry identity belongs to the actor, agent and delivery it was first
 * used for. Preparation is not consulted.
 */
export function decideAssignment(
  facts: AssignmentFacts,
  now: Date,
): AssignmentDecision {
  const { agent, delivery, request_holder } = facts
  const refuse = (code: AssignmentRefusal): AssignmentDecision => ({
    outcome: "refused",
    code,
  })
  if (
    request_holder &&
    (request_holder.order_id !== delivery.order_id ||
      request_holder.agent_id !== agent.id ||
      request_holder.actor_id !== facts.actor_id)
  )
    return refuse("assignment_request_reused")
  if (agent.status !== "authorized")
    return refuse("delivery_agent_not_authorized")
  // A terminal Order outcome wins even over the responsible agent's repeat.
  if (!facts.order_active) return refuse("delivery_not_active")
  if (delivery.assigned_agent_id === agent.id)
    return { outcome: "already_assigned" }
  if (delivery.assigned_agent_id) return refuse("delivery_already_assigned")
  if (now.getTime() >= new Date(delivery.claim_deadline).getTime())
    return refuse("claim_deadline_passed")
  if (
    !agent.postal_codes.includes(delivery.pickup_postal_code) ||
    !agent.postal_codes.includes(delivery.destination_postal_code)
  )
    return refuse("delivery_outside_approved_areas")
  if (agent.active_order_id) return refuse("delivery_agent_has_active_delivery")
  return { outcome: "assign" }
}
