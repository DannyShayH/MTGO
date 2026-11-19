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

/** Read under the delivery and attention row locks, at the sweep's time. */
export type { AttentionRuleFacts, AttentionRuleDecision }

/**
 * When each condition stops applying, whatever its deadline. A later
 * condition (assigned without pickup, in transit, unreachable recipient)
 * adds its own entry and the facts it needs.
 */
const CONDITION_ENDED: Record<
  AttentionType,
  (facts: AttentionRuleFacts) => AttentionResolution | null
> = {
  unassigned: ({ delivery }) =>
    delivery.assigned_agent_id ? "assigned" : null,
}

/**
 * The one attention rule (#158; spec #48 stories 42, 48). Attention only
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
  const ended = CONDITION_ENDED[attention.type](facts)
  if (ended) return { action: "resolve", resolution: ended }
  if (!facts.order_active)
    return { action: "resolve", resolution: "order_ended" }
  if (attention.raised_at) return { action: "keep" }
  if (new Date(attention.due_at).getTime() > now.getTime())
    return { action: "wait" }
  return { action: "raise" }
}
