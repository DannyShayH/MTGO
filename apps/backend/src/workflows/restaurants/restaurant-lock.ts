/** Setup changes to one Restaurant are serialized so later guards cannot race them. */
export const restaurantLock = (restaurant_id: string) => ({
  key: `restaurant:${restaurant_id}`,
  timeout: 5,
  ttl: 30,
})
