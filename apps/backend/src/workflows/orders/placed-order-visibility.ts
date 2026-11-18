/** Before #140, placement was marked in Order metadata; such Orders stay placed. */
export const ORDER_STATE_METADATA_KEY = "mtogo_order_state"
export const AWAITING_ACCEPTANCE = "awaiting_restaurant_acceptance"
export const CHECKOUT_REVIEW_KEY = "mtogo_checkout_review"

type OrderFacts = {
  metadata?: Record<string, unknown> | null
  order_operation?: { id: string } | null
}

/**
 * Paid placement is an immutable fact: the Order's operational record exists,
 * whatever its later operational state, or the legacy marker was written.
 */
export const hasPaidPlacement = (order: OrderFacts) =>
  !!order.order_operation || hasLegacyPlacementMarker(order)

/** The pre-#140 placement marker in Order metadata. */
export const hasLegacyPlacementMarker = (order: OrderFacts) =>
  order.metadata?.[ORDER_STATE_METADATA_KEY] === AWAITING_ACCEPTANCE

/** Core completion creates an internal row before authorizing payment. */
export function isVisiblePlacedOrder(order: OrderFacts) {
  return !order.metadata?.[CHECKOUT_REVIEW_KEY] || hasPaidPlacement(order)
}
