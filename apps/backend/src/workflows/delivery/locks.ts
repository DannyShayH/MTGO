/**
 * The agent's capacity key. Assignment and pickup take it before the
 * Order's guard (`orderOperationLock`), always in that order.
 */
export const deliveryAgentLockKey = (agent_id: string) =>
  `delivery-agent:${agent_id}`

/** Serializes one delivery's native pickup synchronization between a request and the sweep. */
export const nativePickupLock = (order_id: string) => ({
  key: `delivery-native-pickup:${order_id}`,
  timeout: 30,
  ttl: 120,
})
