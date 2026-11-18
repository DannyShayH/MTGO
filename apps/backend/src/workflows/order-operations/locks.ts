/**
 * Serializes transitions on one Order (acceptance, rejection and the
 * timeout recovery); the persisted revision guards the write.
 */
export const orderOperationLock = (order_id: string) => ({
  key: `order-operation:${order_id}`,
  timeout: 5,
  ttl: 30,
})

/**
 * Serializes one Order's settlement (refund attempt and native cancellation)
 * between the request that cancelled it and the recovery sweep (#144).
 */
export const orderSettlementLock = (order_id: string) => ({
  key: `order-settlement:${order_id}`,
  timeout: 30,
  ttl: 120,
})
