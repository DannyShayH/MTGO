import type {
  CancellationCategory,
  OrderOperationState,
} from "../../modules/order-operation/models/order-operation"
import { DEACTIVATION_REASON_MAX_LENGTH } from "../restaurants/deactivation-reason"

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

/** The actor recorded for automatic outcomes, such as an acceptance timeout. */
export const SYSTEM_ACTOR = "system"

export type CancellationDecision =
  | { outcome: "cancel"; category: CancellationCategory }
  | { outcome: "already_cancelled" }
  | {
      outcome: "refused"
      code: "acceptance_timing_unavailable" | "order_not_awaiting_acceptance"
    }

/**
 * Whether a pre-acceptance cancellation applies now (spec #47 stories 11,
 * 13, 14, 31; #143). The same expiry rule as acceptance comes first: at or
 * after the deadline the Order receives the timeout outcome, whoever asked.
 * A recorded cancellation is the current outcome for any repeat. Accepted
 * work is the operator's to cancel (#49), and a legacy Order without a
 * deadline is never refunded on a guessed one.
 */
export function decideCancellation(
  order: AcceptanceFacts,
  requested: Exclude<CancellationCategory, "acceptance_timeout">,
  now: Date,
): CancellationDecision {
  if (order.state === "cancelled") return { outcome: "already_cancelled" }
  if (order.state !== "awaiting_acceptance")
    return { outcome: "refused", code: "order_not_awaiting_acceptance" }
  const window = acceptanceWindow(order.acceptance_deadline, now)
  if (window === "unavailable")
    return { outcome: "refused", code: "acceptance_timing_unavailable" }
  return {
    outcome: "cancel",
    category: window === "open" ? requested : "acceptance_timeout",
  }
}

/** The shared bound for a free-text reason, as for Restaurant deactivation. */
export const REJECTION_REASON_MAX_LENGTH = DEACTIVATION_REASON_MAX_LENGTH

// Control characters except tab and line feed, which a note may contain.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F]/g

/**
 * The stored form of an optional rejection reason: control characters
 * removed and trimmed; nothing left means no reason. Length is bounded by
 * the validator before this runs.
 */
export function rejectionNote(raw: string | null | undefined): string | null {
  const note = (raw ?? "").replace(CONTROL_CHARACTERS, "").trim()
  return note || null
}

export type OrderAction = "accept" | "reject"

/**
 * The actions staff may take now. Reject is offered exactly while Accept is:
 * after acceptance, inability to fulfil goes to an operator (#49).
 */
export const availableActions = (
  order: AcceptanceFacts,
  now: Date,
): OrderAction[] =>
  decideAcceptance(order, now).outcome === "accept" ? ["accept", "reject"] : []

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
