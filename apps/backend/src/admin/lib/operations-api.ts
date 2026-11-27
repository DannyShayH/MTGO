/** The operations read (#54) as `GET /admin/operations` returns it. */
export type OpenOrderStage =
  | "awaiting_acceptance"
  | "accepted_or_preparing"
  | "ready_unassigned"
  | "assigned_not_picked_up"
  | "picked_up"

export type Operations = {
  /** The one moment every figure was calculated for. */
  as_of: string
  scope: { type: "platform" } | { type: "restaurant"; restaurant_id: string }
  open_orders: {
    period: { at: string }
    total: number
    stages: { stage: OpenOrderStage; count: number }[]
    exclusions: { reason: string; count: number }[]
  }
}

/** Operator wording for each stage, in the order work moves through them. */
export const openOrderStageLabels: Record<OpenOrderStage, string> = {
  awaiting_acceptance: "Awaiting acceptance",
  accepted_or_preparing: "Accepted or preparing",
  ready_unassigned: "Ready, no agent",
  assigned_not_picked_up: "Agent assigned, not picked up",
  picked_up: "Picked up, not handed over",
}

/** A Copenhagen date and time to the second, as the calculation moment. */
export const formatCalculatedAt = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
