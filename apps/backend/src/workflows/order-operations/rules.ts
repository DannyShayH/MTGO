import type { OrderOperationState } from "../../modules/order-operation/models/order-operation"

/** Staff must accept strictly before paid placement plus five minutes (ADR-0009). */
export const ACCEPTANCE_WINDOW_MS = 5 * 60 * 1000

export const acceptanceDeadline = (placedAt: Date) =>
  new Date(placedAt.getTime() + ACCEPTANCE_WINDOW_MS)

export type AcceptanceWindow = "open" | "elapsed" | "unavailable"

/**
 * At exactly the deadline it is too late. A legacy Order placed before the
 * deadline was recorded has no window, rather than an invented one.
 */
export function acceptanceWindow(
  deadline: Date | string | null | undefined,
  now: Date,
): AcceptanceWindow {
  if (!deadline) return "unavailable"
  return now.getTime() < new Date(deadline).getTime() ? "open" : "elapsed"
}

export const QUEUE_VIEWS = ["awaiting", "active", "history"] as const
export type QueueView = (typeof QUEUE_VIEWS)[number]

type Direction = "ASC" | "DESC"

const VIEWS: Record<
  QueueView,
  { states: OrderOperationState[]; order: Record<string, Direction> }
> = {
  // Legacy Orders without a deadline sort last (PostgreSQL puts NULL last in ASC).
  awaiting: {
    states: ["awaiting_acceptance"],
    order: { acceptance_deadline: "ASC", id: "ASC" },
  },
  active: {
    states: ["accepted", "preparing", "ready"],
    order: { placed_at: "ASC", id: "ASC" },
  },
  history: { states: ["cancelled"], order: { placed_at: "DESC", id: "DESC" } },
}

/** Which operational states a queue view shows, and in which order. */
export const queueView = (view: QueueView) => VIEWS[view]
