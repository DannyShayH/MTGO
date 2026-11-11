type RestaurantAvailability = {
  is_active: boolean
  is_open: boolean
  delivery_postal_codes: string[]
}

/** Shared status rule; without a destination it describes general availability. */
export function evaluateNewOrderEligibility(
  facts: RestaurantAvailability,
  destination?: string,
) {
  let reason:
    | "restaurant_inactive"
    | "restaurant_closed"
    | "delivery_area_missing"
    | "destination_not_served"
    | null = null
  if (!facts.is_active) reason = "restaurant_inactive"
  else if (!facts.is_open) reason = "restaurant_closed"
  else if (!facts.delivery_postal_codes.length) reason = "delivery_area_missing"
  else if (destination && !facts.delivery_postal_codes.includes(destination))
    reason = "destination_not_served"
  return { receiving_new_orders: reason === null, reason }
}
