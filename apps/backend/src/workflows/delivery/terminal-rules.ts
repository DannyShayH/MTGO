import type {
  TerminalDecision,
  TerminalFacts,
} from "../../modules/delivery/service"
import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"

/** Refusals because of the delivery, the Order or the agent (`NOT_ALLOWED`, 400). */
export const HANDOVER_REFUSALS = [
  "pickup_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
] as const

/** Refusals because another request already holds the state (`CONFLICT`, 409). */
export const HANDOVER_CONFLICTS = [
  "handover_request_reused",
  "delivery_changed",
] as const

export type HandoverRefusal =
  | (typeof HANDOVER_REFUSALS)[number]
  | (typeof HANDOVER_CONFLICTS)[number]
  | "delivery_agent_not_authorized"

/** A handover always names the confirming agent. */
export type HandoverFacts = TerminalFacts & {
  agent: NonNullable<TerminalFacts["agent"]>
}

export type HandoverDecision =
  | { outcome: "deliver" }
  | { outcome: "already_delivered" }
  | { outcome: "refused"; code: HandoverRefusal }

/**
 * The handover rule (#161; spec #48 stories 39, 40). Only the responsible,
 * authorized agent still holding an active delivery with a recorded pickup
 * may confirm actual handover. No arrival, location, permission or elapsed
 * time is read: nothing but this confirmation marks work delivered. A
 * recorded handover is returned unchanged to its agent, so a double tap or a
 * lost response never moves its time; cancelled or failed work is refused.
 * A retry identity belongs to the delivery and agent it was first used for.
 */
export function decideHandover(facts: HandoverFacts): HandoverDecision {
  const { agent, delivery, request_holder } = facts
  const refuse = (code: HandoverRefusal): HandoverDecision => ({
    outcome: "refused",
    code,
  })
  if (
    request_holder &&
    (request_holder.order_id !== delivery.order_id ||
      request_holder.agent_id !== agent.id)
  )
    return refuse("handover_request_reused")
  if (agent.status !== "authorized")
    return refuse("delivery_agent_not_authorized")
  if (delivery.assigned_agent_id !== agent.id)
    return refuse("delivery_not_responsible")
  if (delivery.terminal_outcome === "delivered")
    return { outcome: "already_delivered" }
  if (
    delivery.terminal_outcome ||
    !facts.order_active ||
    delivery.active_agent_id !== agent.id
  )
    return refuse("delivery_not_active")
  if (!delivery.picked_up_at) return refuse("pickup_not_recorded")
  return { outcome: "deliver" }
}

/** The handover rule in the shape the module's terminal transition takes. */
export function handoverTransition(facts: TerminalFacts): TerminalDecision {
  if (!facts.agent)
    return { outcome: "refused", code: "delivery_agent_not_authorized" }
  const decision = decideHandover({ ...facts, agent: facts.agent })
  return decision.outcome === "deliver" ? { outcome: "end" } : decision
}

export type TerminationDecision =
  | { outcome: "end" }
  | { outcome: "already_ended"; terminal_outcome: TerminalOutcome }

/**
 * The rule for an authoritative cancellation or an operator-confirmed
 * failure (#161 boundary for #162 and #49): active work ends; work that
 * already ended keeps its original outcome, so a delivered Order is never
 * rewritten as cancelled and a repeat changes nothing.
 */
export function decideTermination(delivery: {
  terminal_outcome: TerminalOutcome | null
}): TerminationDecision {
  return delivery.terminal_outcome
    ? { outcome: "already_ended", terminal_outcome: delivery.terminal_outcome }
    : { outcome: "end" }
}
