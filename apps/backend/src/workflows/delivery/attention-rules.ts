import type {
  AttentionResolution,
  AttentionType,
} from "../../modules/delivery/models/delivery-attention"
import type {
  AttentionRuleDecision,
  AttentionRuleFacts,
} from "../../modules/delivery/service"

/** Unassigned work needs operator attention at acceptance plus ten minutes. */
export const UNASSIGNED_ATTENTION_MS = 10 * 60 * 1000

/** The durable Restaurant acceptance time is the only origin of the deadline. */
export const unassignedAttentionDueAt = (acceptedAt: Date | string) =>
  new Date(new Date(acceptedAt).getTime() + UNASSIGNED_ATTENTION_MS)

/**
 * Assigned work needs operator attention thirty minutes after its origin:
 * acceptance while uncollected, pickup while undelivered (#163). These are
 * attention thresholds, never promised times or automatic outcomes.
 */
export const STALLED_ATTENTION_MS = 30 * 60 * 1000

/** The conditions of stalled assigned work, shown on the agent's phone. */
export const STALLED_ATTENTION_TYPES = [
  "assigned_without_pickup",
  "in_transit_without_delivery",
] as const satisfies readonly AttentionType[]
export type StalledAttentionType = (typeof STALLED_ATTENTION_TYPES)[number]

export const stalledAttentionDueAt = (origin: Date | string) =>
  new Date(new Date(origin).getTime() + STALLED_ATTENTION_MS)

/** Read under the delivery and attention row locks, at the sweep's time. */
export type { AttentionRuleFacts, AttentionRuleDecision }

/**
 * When each condition stops applying, whatever its deadline. A later
 * condition (unreachable recipient) adds its own entry and the facts it
 * needs. A terminal outcome ends every condition first (see below).
 */
const CONDITION_ENDED: Record<
  AttentionType,
  (facts: AttentionRuleFacts) => AttentionResolution | null
> = {
  unassigned: ({ delivery }) =>
    delivery.assigned_agent_id ? "assigned" : null,
  // Revoked access is never restored and the assignment is never released,
  // so only the Order ending (checked by the rule) stops this condition.
  access_revoked: () => null,
  assigned_without_pickup: ({ delivery }) =>
    delivery.picked_up_at ? "picked_up" : null,
  // Only the terminal outcome ends transit.
  in_transit_without_delivery: () => null,
}

/**
 * The one attention rule (#158, #163; spec #48 stories 42, 48-50). Attention only
 * becomes visible or stops being outstanding: it never cancels, releases or
 * completes work. An ended condition or Order takes precedence over the
 * deadline, so a valid assignment removes unassigned attention whether or not
 * it was raised. Due exactly at the deadline, whenever the sweep processes
 * it, and raised only once.
 */
export function decideAttention(
  facts: AttentionRuleFacts,
  now: Date,
): AttentionRuleDecision {
  const { attention } = facts
  if (attention.resolved_at) return { action: "keep" }
  const { terminal_outcome } = facts.delivery
  // Ended work makes every condition obsolete, a handover included (#161).
  if (terminal_outcome)
    return {
      action: "resolve",
      resolution:
        terminal_outcome === "delivered" ? "delivered" : "order_ended",
    }
  const ended = CONDITION_ENDED[attention.type](facts)
  if (ended) return { action: "resolve", resolution: ended }
  if (!facts.order_active)
    return { action: "resolve", resolution: "order_ended" }
  if (attention.raised_at) return { action: "keep" }
  if (new Date(attention.due_at).getTime() > now.getTime())
    return { action: "wait" }
  return { action: "raise" }
}
