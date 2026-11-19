/** Before #140, placement was marked in Order metadata; such Orders stay placed. */
export const ORDER_STATE_METADATA_KEY = "mtogo_order_state"
export const AWAITING_ACCEPTANCE = "awaiting_restaurant_acceptance"
export const CHECKOUT_REVIEW_KEY = "mtogo_checkout_review"
/**
 * The Order's copy of its placement record id (#154), written in the same
 * placement as the record. The record stays the placement fact; the copy lets
 * Order list queries filter on placement without a second lookup.
 */
export const PLACEMENT_MARKER_KEY = "mtogo_paid_placement"

export type OrderFacts = {
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

/**
 * `isVisiblePlacedOrder` as an Order list filter, read from metadata alone:
 * no checkout review, the placement marker, or the legacy marker.
 */
export const visiblePlacedOrderFilter = {
  $or: [
    { metadata: { [CHECKOUT_REVIEW_KEY]: null } },
    { metadata: { [PLACEMENT_MARKER_KEY]: { $ne: null } } },
    { metadata: { [ORDER_STATE_METADATA_KEY]: AWAITING_ACCEPTANCE } },
  ],
}
