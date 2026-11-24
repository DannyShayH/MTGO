import type {
  DeliveryOutcome,
  OrderOperationState,
} from "../../modules/order-operation/models/order-operation"
import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"
import { isActiveOrderState } from "../delivery/assignment-rules"

/** Refusals of an Operator cancellation because of the Order (`NOT_ALLOWED`, 400). */
export const OPERATOR_CANCELLATION_REFUSALS = [
  "order_not_accepted",
  "order_delivered",
] as const
export type OperatorCancellationRefusal =
  (typeof OPERATOR_CANCELLATION_REFUSALS)[number]

export type OperatorCancellationDecision =
  | { outcome: "cancel"; category: "operator_cancelled" }
  | { outcome: "already_cancelled" }
  | { outcome: "refused"; code: OperatorCancellationRefusal }

type OrderFacts = {
  state: OrderOperationState
  accepted_at: Date | string | null | undefined
  delivery_outcome?: DeliveryOutcome | null
}

/** The Order's delivery, read under the Order's guard; null when it has none. */
export type OperatorCancellationDeliveryFacts = {
  terminal_outcome: TerminalOutcome | null
} | null

/**
 * Whether an operator may cancel the Order with a full refund (#199; spec #49
 * stories 25-39; ADR-0011). After Restaurant acceptance only an operator may
 * cancel, at any unfinished stage: accepted, preparing or ready, whether the
 * delivery is unassigned, assigned or picked up. Before acceptance the
 * Customer's and the Restaurant's own actions stay in charge. A handover
 * already committed on the delivery makes the Order delivered even before the
 * Order has copied it (#204), so a delivered Order is never cancelled. A
 * recorded cancellation is the current outcome for a repeat.
 */
export function decideOperatorCancellation(
  order: OrderFacts,
  delivery: OperatorCancellationDeliveryFacts,
): OperatorCancellationDecision {
  if (order.state === "cancelled") return { outcome: "already_cancelled" }
  if (
    order.delivery_outcome === "delivered" ||
    delivery?.terminal_outcome === "delivered"
  )
    return { outcome: "refused", code: "order_delivered" }
  if (!order.accepted_at || !isActiveOrderState(order.state))
    return { outcome: "refused", code: "order_not_accepted" }
  return { outcome: "cancel", category: "operator_cancelled" }
}
