/**
 * The agent's capacity key. Assignment, pickup and handover take it before the
 * Order's guard (`orderOperationLock`), always in that order.
 */
export const deliveryAgentLockKey = (agent_id: string) =>
  `delivery-agent:${agent_id}`

/** Serializes one delivery's native fulfillment synchronization between a request and the sweep. */
export const nativeFulfillmentLock = (order_id: string) => ({
  key: `delivery-native-fulfillment:${order_id}`,
  timeout: 30,
  ttl: 120,
})
