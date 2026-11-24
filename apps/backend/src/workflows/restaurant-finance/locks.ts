/**
 * The shared finance guard of one Restaurant (spec #52 §7, §9): financial
 * posting for the Restaurant serializes under it, and the posting month is
 * decided inside it. It is taken after an Order's operational guard has been
 * released, never inside it, so the two never lock in opposite order.
 */
export const restaurantFinanceLock = (restaurant_id: string) => ({
  key: `restaurant-finance:${restaurant_id}`,
  timeout: 10,
  ttl: 60,
})
