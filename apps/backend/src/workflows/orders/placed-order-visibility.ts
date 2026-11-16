export const ORDER_STATE_METADATA_KEY = "mtogo_order_state"
export const AWAITING_ACCEPTANCE = "awaiting_restaurant_acceptance"
export const CHECKOUT_REVIEW_KEY = "mtogo_checkout_review"

/** Core completion creates an internal row before authorizing payment. */
export function isVisiblePlacedOrder(order: {
  metadata?: Record<string, unknown> | null
}) {
  return (
    !order.metadata?.[CHECKOUT_REVIEW_KEY] ||
    order.metadata[ORDER_STATE_METADATA_KEY] === AWAITING_ACCEPTANCE
  )
}
