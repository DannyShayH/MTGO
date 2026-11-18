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

/** Refusals because of the Order's current state (`NOT_ALLOWED`, 400). */
export const ACCEPTANCE_REFUSALS = [
  "acceptance_window_elapsed",
  "acceptance_timing_unavailable",
  "order_not_awaiting_acceptance",
] as const
export type AcceptanceRefusal = (typeof ACCEPTANCE_REFUSALS)[number]

/** A guarded write found the record changed after it was read (`CONFLICT`, 409). */
export const ORDER_CHANGED = "order_changed"

export type AcceptanceDecision =
  | { outcome: "accept" }
  | { outcome: "already_accepted" }
  | { outcome: "refused"; code: AcceptanceRefusal }

type AcceptanceFacts = {
  state: OrderOperationState
  acceptance_deadline: Date | string | null | undefined
  accepted_at: Date | string | null | undefined
}

/**
 * Whether staff may accept now (spec #47 stories 9, 12-14). `now` is the
 * server's time at the guarded transition, never the browser's. A recorded
 * acceptance is the current outcome for a repeat, even after the deadline or a
 * later milestone, so it is never duplicated or undone. A cancellation is the
 * current outcome even when it followed an acceptance.
 */
export function decideAcceptance(
  order: AcceptanceFacts,
  now: Date,
): AcceptanceDecision {
  if (order.state === "cancelled")
    return { outcome: "refused", code: "order_not_awaiting_acceptance" }
  if (order.accepted_at) return { outcome: "already_accepted" }
  if (order.state !== "awaiting_acceptance")
    return { outcome: "refused", code: "order_not_awaiting_acceptance" }
  const window = acceptanceWindow(order.acceptance_deadline, now)
  if (window === "open") return { outcome: "accept" }
  return {
    outcome: "refused",
    code:
      window === "elapsed"
        ? "acceptance_window_elapsed"
        : "acceptance_timing_unavailable",
  }
}

export type OrderAction = "accept"

/** The actions staff may take now; later slices add reject and preparation. */
export const availableActions = (
  order: AcceptanceFacts,
  now: Date,
): OrderAction[] =>
  decideAcceptance(order, now).outcome === "accept" ? ["accept"] : []

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
