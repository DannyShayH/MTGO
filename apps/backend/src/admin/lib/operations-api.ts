import type { AttentionType } from "./attention-types"

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
  /** Open Orders without a Delivery agent, and those waiting over 10 min (#260). */
  unassigned_deliveries: {
    period: { at: string }
    total: number
    waiting_over_ten_minutes: number
    exclusions: { reason: string; count: number }[]
  }
  /** Raised, unresolved attention items by type, as the deliveries page lists them. */
  attention: {
    period: { at: string }
    total: number
    types: (
      | {
          type: "unassigned"
          count: number
          /** Of these, the Orders counted as waiting over 10 minutes. */
          waiting_unassigned_orders: number
        }
      | { type: Exclude<AttentionType, "unassigned">; count: number }
    )[]
    exclusions: { reason: string; count: number }[]
  }
  /** Full refunds still owed, as the Refunds page lists them. */
  full_refunds: {
    period: { at: string }
    total: number
    pending: number
    failed: number
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
