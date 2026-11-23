import {
  CANCELLATION_CATEGORIES,
  DELIVERY_OUTCOMES,
  type CancellationCategory,
  type DeliveryOutcome,
  type OrderOperationState,
} from "../../modules/order-operation/models/order-operation"
import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"
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
      code:
        | "acceptance_timing_unavailable"
        | "order_not_awaiting_acceptance"
        | "acceptance_window_open"
    }

/**
 * Whether a pre-acceptance cancellation applies now (spec #47 stories 11,
 * 13, 14, 31; #143). The same expiry rule as acceptance comes first: at or
 * after the deadline the Order receives the timeout outcome, whoever asked.
 * A recorded cancellation is the current outcome for any repeat. Accepted
 * work is the operator's to cancel (#49), and a legacy Order without a
 * deadline is never refunded on a guessed one.
 *
 * The recovery sweep requests `acceptance_timeout` itself (#144): while the
 * window is open the Order is still the staff's, so the sweep is refused.
 */
export function decideCancellation(
  order: AcceptanceFacts,
  requested: CancellationCategory,
  now: Date,
): CancellationDecision {
  if (order.state === "cancelled") return { outcome: "already_cancelled" }
  if (order.state !== "awaiting_acceptance")
    return { outcome: "refused", code: "order_not_awaiting_acceptance" }
  const window = acceptanceWindow(order.acceptance_deadline, now)
  if (window === "unavailable")
    return { outcome: "refused", code: "acceptance_timing_unavailable" }
  if (window === "open" && requested === "acceptance_timeout")
    return { outcome: "refused", code: "acceptance_window_open" }
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

/**
 * Refusals of a kitchen milestone because of the Order's current state
 * (`NOT_ALLOWED`, 400). Staff cannot skip preparation or record food progress
 * on an Order that is not, or no longer, accepted kitchen work.
 */
export const PROGRESS_REFUSALS = [
  "order_not_accepted",
  "preparation_not_started",
  "order_cancelled",
] as const
export type ProgressRefusal = (typeof PROGRESS_REFUSALS)[number]

export type TransitionRefusal = AcceptanceRefusal | ProgressRefusal

/**
 * The guarded milestones staff record, in kitchen order. Each moves the
 * record from one state to the next and records its time and actor.
 */
export const ORDER_TRANSITIONS = {
  accept: {
    from: "awaiting_acceptance",
    to: "accepted",
    at: "accepted_at",
    by: "accepted_by",
  },
  start_preparation: {
    from: "accepted",
    to: "preparing",
    at: "preparation_started_at",
    by: "preparation_started_by",
  },
  ready: {
    from: "preparing",
    to: "ready",
    at: "ready_at",
    by: "ready_by",
  },
} as const satisfies Record<
  string,
  { from: OrderOperationState; to: OrderOperationState; at: string; by: string }
>
export type MilestoneAction = keyof typeof ORDER_TRANSITIONS
export const MILESTONE_ACTIONS = Object.keys(
  ORDER_TRANSITIONS,
) as MilestoneAction[]

export type TransitionDecision =
  | { outcome: "apply" }
  | { outcome: "already_recorded" }
  | { outcome: "refused"; code: TransitionRefusal }

export type TransitionFacts = AcceptanceFacts & {
  preparation_started_at?: Date | string | null
  ready_at?: Date | string | null
}

/**
 * Whether staff may record a milestone now (spec #47 stories 13-18). A
 * cancellation is the current outcome. Otherwise a recorded milestone is
 * returned unchanged, so retries never duplicate or move it, and a milestone
 * applies only from its preceding state: acceptance never starts preparation
 * and readiness never invents a preparation start. None of them depends on a
 * Delivery agent, and only acceptance depends on the deadline.
 */
export function decideTransition(
  action: MilestoneAction,
  order: TransitionFacts,
  now: Date,
): TransitionDecision {
  if (action === "accept") {
    const decision = decideAcceptance(order, now)
    if (decision.outcome === "accept") return { outcome: "apply" }
    if (decision.outcome === "already_accepted")
      return { outcome: "already_recorded" }
    return decision
  }
  if (order.state === "cancelled")
    return { outcome: "refused", code: "order_cancelled" }
  const { from, at } = ORDER_TRANSITIONS[action]
  if (order[at]) return { outcome: "already_recorded" }
  if (order.state === from) return { outcome: "apply" }
  return {
    outcome: "refused",
    code:
      order.state === "awaiting_acceptance"
        ? "order_not_accepted"
        : "preparation_not_started",
  }
}

export type OrderAction = MilestoneAction | "reject"

/**
 * The actions staff may take now: the one next milestone, and Reject exactly
 * while Accept is offered. After acceptance, inability to fulfil goes to an
 * operator (#49).
 */
export const availableActions = (
  order: TransitionFacts,
  now: Date,
): OrderAction[] =>
  MILESTONE_ACTIONS.filter(
    (action) => decideTransition(action, order, now).outcome === "apply",
  ).flatMap((action): OrderAction[] =>
    action === "accept" ? ["accept", "reject"] : [action],
  )

export type CustomerOrderAction = "cancel"

/**
 * What the owning Customer may do now (#145; spec #47 stories 27, 29, 30):
 * Cancel exactly while the Order would still be recorded as their own
 * cancellation, that is awaiting acceptance strictly before its deadline.
 * After acceptance the Customer is directed to an operator.
 */
export const customerActions = (
  order: AcceptanceFacts,
  now: Date,
): CustomerOrderAction[] => {
  const decision = decideCancellation(order, "customer_cancelled", now)
  return decision.outcome === "cancel" &&
    decision.category === "customer_cancelled"
    ? ["cancel"]
    : []
}

export { CANCELLATION_CATEGORIES, DELIVERY_OUTCOMES }

/**
 * How the kitchen records a delivery's terminal outcome (#204): handed over,
 * or ended without handover, whether cancelled or failed.
 */
export const deliveryOutcomeOf = (
  terminal: TerminalOutcome,
): DeliveryOutcome => (terminal === "delivered" ? "delivered" : "not_delivered")

export const QUEUE_VIEWS = ["awaiting", "active", "history"] as const
export type QueueView = (typeof QUEUE_VIEWS)[number]

type Direction = "ASC" | "DESC"

const VIEWS = {
  // Legacy Orders without a deadline sort last (PostgreSQL puts NULL last in ASC).
  awaiting: {
    where: { state: ["awaiting_acceptance"] },
    order: { acceptance_deadline: "ASC", id: "ASC" },
  },
  // Kitchen work leaves when its delivery ends (#204), even though the
  // kitchen's own state stays `ready`.
  active: {
    where: {
      state: ["accepted", "preparing", "ready"],
      delivery_outcome: null,
    },
    order: { placed_at: "ASC", id: "ASC" },
  },
  history: {
    where: {
      $or: [{ state: ["cancelled"] }, { delivery_outcome: { $ne: null } }],
    },
    order: { placed_at: "DESC", id: "DESC" },
  },
} as const satisfies Record<
  QueueView,
  {
    where: Record<string, unknown>
    order: Record<string, Direction>
  }
>

/** Which Orders a queue view shows, and in which order. */
export const queueView = (view: QueueView) => VIEWS[view]

/** Optional narrowing of a queue view; the Restaurant always comes from the staff record. */
export type QueueFilters = {
  /** Inclusive lower bound of paid placement. */
  placed_from?: Date
  /** Exclusive upper bound, so consecutive days never overlap. */
  placed_to?: Date
  cancellation_category?: CancellationCategory
  /** History only: how the delivery ended, for Orders that were not cancelled. */
  delivery_outcome?: DeliveryOutcome
}

/**
 * The Order Operations filter for one view of one Restaurant. `orderIds`
 * holds the Orders matching a searched number; ownership still comes from
 * `restaurant_id`, so another Restaurant's Order with that number never shows.
 */
export function queueFilter(
  restaurant_id: string,
  view: QueueView,
  filters: QueueFilters,
  orderIds?: string[],
) {
  const { placed_from, placed_to, cancellation_category, delivery_outcome } =
    filters
  return {
    restaurant_id,
    ...queueView(view).where,
    ...((placed_from || placed_to) && {
      placed_at: {
        ...(placed_from && { $gte: placed_from }),
        ...(placed_to && { $lt: placed_to }),
      },
    }),
    ...(cancellation_category && { cancellation_category }),
    // A cancellation is why a cancelled Order ended, whatever its delivery did.
    ...(delivery_outcome && { delivery_outcome, state: { $ne: "cancelled" } }),
    ...(orderIds && { order_id: orderIds }),
  }
}
