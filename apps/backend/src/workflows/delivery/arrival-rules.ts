import type {
  ArrivalFacts,
  ContactAttemptFacts,
} from "../../modules/delivery/service"

/** Refusals because of the delivery, the Order or the agent (`NOT_ALLOWED`, 400). */
export const ARRIVAL_REFUSALS = [
  "pickup_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
] as const

/** Refusals because another request already holds the state (`CONFLICT`, 409). */
export const ARRIVAL_CONFLICTS = [
  "arrival_request_reused",
  "delivery_changed",
] as const

export type ArrivalRefusal =
  | (typeof ARRIVAL_REFUSALS)[number]
  | (typeof ARRIVAL_CONFLICTS)[number]
  | "delivery_agent_not_authorized"

export type ArrivalDecision =
  | { outcome: "arrive" }
  | { outcome: "already_arrived" }
  | { outcome: "refused"; code: ArrivalRefusal }

/** Refusals because of the delivery, the Order or the agent (`NOT_ALLOWED`, 400). */
export const CONTACT_ATTEMPT_REFUSALS = [
  "arrival_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
  "contact_attempt_limit_reached",
] as const

/** Refusals because another request already holds the state (`CONFLICT`, 409). */
export const CONTACT_ATTEMPT_CONFLICTS = [
  "contact_attempt_request_reused",
] as const

export type ContactAttemptRefusal =
  | (typeof CONTACT_ATTEMPT_REFUSALS)[number]
  | (typeof CONTACT_ATTEMPT_CONFLICTS)[number]
  | "delivery_agent_not_authorized"

export type ContactAttemptDecision =
  | { outcome: "record" }
  | { outcome: "already_recorded" }
  | { outcome: "refused"; code: ContactAttemptRefusal }

/**
 * Contact attempts kept per delivery. Generous for real waiting at a door,
 * and a bound on what one delivery can store.
 */
export const CONTACT_ATTEMPT_LIMIT = 20

/**
 * An unreachable Customer needs operator attention ten minutes after the
 * agent's explicit arrival (#164; spec #48 story 38).
 */
export const ARRIVAL_ATTENTION_MS = 10 * 60 * 1000

/** The recorded arrival is the only origin of the unreachable-Customer clock. */
export const arrivalAttentionDueAt = (arrivedAt: Date | string) =>
  new Date(new Date(arrivedAt).getTime() + ARRIVAL_ATTENTION_MS)

export type { ArrivalFacts, ContactAttemptFacts }

type Responsibility = {
  agent: ArrivalFacts["agent"]
  delivery: ArrivalFacts["delivery"]
  order_active: boolean
}

/** A retry identity belongs to the delivery and agent it was first used for. */
function isHeldElsewhere({ agent, delivery, request_holder }: ArrivalFacts) {
  return (
    !!request_holder &&
    (request_holder.order_id !== delivery.order_id ||
      request_holder.agent_id !== agent.id)
  )
}

/** The shared checks: authorized, responsible, still holding active work. */
function refuseUnlessHolding(
  facts: Responsibility,
):
  | "delivery_agent_not_authorized"
  | "delivery_not_responsible"
  | "delivery_not_active"
  | null {
  const { agent, delivery } = facts
  if (agent.status !== "authorized") return "delivery_agent_not_authorized"
  if (delivery.assigned_agent_id !== agent.id) return "delivery_not_responsible"
  if (
    delivery.terminal_outcome ||
    !facts.order_active ||
    delivery.active_agent_id !== agent.id
  )
    return "delivery_not_active"
  return null
}

/**
 * The arrival rule (#164; spec #48 story 36). Only the responsible,
 * authorized agent of active, collected work may record arrival. It starts
 * the unreachable-Customer clock and nothing else: no location or timer
 * creates it, and it never stands for handover. A recorded arrival is
 * returned unchanged, so a double tap or a lost response never moves its
 * time; ended work refuses even a repeat. A retry identity belongs to the
 * delivery and agent it was first used for.
 */
export function decideArrival(facts: ArrivalFacts): ArrivalDecision {
  const { delivery } = facts
  const refuse = (code: ArrivalRefusal): ArrivalDecision => ({
    outcome: "refused",
    code,
  })
  if (isHeldElsewhere(facts)) return refuse("arrival_request_reused")
  const refused = refuseUnlessHolding(facts)
  if (refused) return refuse(refused)
  if (delivery.arrived_at) return { outcome: "already_arrived" }
  if (!delivery.picked_up_at) return refuse("pickup_not_recorded")
  return { outcome: "arrive" }
}

/**
 * The contact-attempt rule (#164; spec #48 story 37). After arrival the
 * responsible agent records each attempt to reach the Customer as its own
 * record. An attempt claims no outcome: it never means the Customer was
 * reached, and opening the dialer records nothing. The same retry identity
 * returns the attempt it recorded instead of adding another; on another
 * delivery or agent it is refused.
 */
export function decideContactAttempt(
  facts: ContactAttemptFacts,
): ContactAttemptDecision {
  const { delivery, request_holder } = facts
  const refuse = (code: ContactAttemptRefusal): ContactAttemptDecision => ({
    outcome: "refused",
    code,
  })
  if (isHeldElsewhere(facts)) return refuse("contact_attempt_request_reused")
  const refused = refuseUnlessHolding(facts)
  if (refused) return refuse(refused)
  if (request_holder) return { outcome: "already_recorded" }
  if (!delivery.arrived_at) return refuse("arrival_not_recorded")
  if (facts.attempt_count >= CONTACT_ATTEMPT_LIMIT)
    return refuse("contact_attempt_limit_reached")
  return { outcome: "record" }
}
