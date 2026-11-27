/** The outstanding conditions an operator must notice (#49). */
export type AttentionType =
  | "unassigned"
  | "access_revoked"
  | "assigned_without_pickup"
  | "in_transit_without_delivery"
  | "arrived_without_handover"
  | "agent_reported_problem"

/** What each outstanding condition means to the operator. */
export const ATTENTION: Record<
  AttentionType,
  { label: string; detail: string }
> = {
  unassigned: {
    label: "Unassigned after 10 min",
    detail: "No agent has taken this delivery ten minutes after acceptance.",
  },
  access_revoked: {
    label: "Agent access revoked",
    detail:
      "The responsible agent's access was revoked. The delivery stays assigned to them and still counts as their active delivery until it ends.",
  },
  assigned_without_pickup: {
    label: "Not picked up after 30 min",
    detail:
      "The assigned agent has not confirmed pickup thirty minutes after acceptance. The delivery stays assigned to them; nothing is cancelled.",
  },
  in_transit_without_delivery: {
    label: "Not delivered 30 min after pickup",
    detail:
      "The agent has not confirmed handover thirty minutes after pickup. The delivery stays assigned to them and is not marked delivered.",
  },
  arrived_without_handover: {
    label: "Customer unreachable 10 min after arrival",
    detail:
      "The agent recorded arriving at the Customer, but no handover followed within ten minutes. Escalate: contact the agent and the Customer. The delivery stays assigned to the agent and is not marked delivered.",
  },
  agent_reported_problem: {
    label: "Agent reported a problem",
    detail:
      "The responsible agent reported a problem. The delivery remains assigned.",
  },
}
