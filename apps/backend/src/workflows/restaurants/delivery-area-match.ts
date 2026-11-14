/** How much of a browsing location a Restaurant's delivery area covers. */
export type DeliveryAreaMatch = {
  served_postal_codes: number
  location_postal_codes: number
}

/**
 * The Restaurants whose delivery area contains at least one of the location's
 * codes, each once and in the given order. A town match covers part of the
 * town when `served_postal_codes` is below `location_postal_codes`; actual
 * eligibility needs the exact destination code. No codes match nothing, so an
 * unknown location never broadens to every Restaurant.
 */
export function matchDeliveryArea<
  T extends { delivery_area_postal_codes: string[] },
>(
  restaurants: T[],
  locationPostalCodes: string[],
): (T & { delivery_area_match: DeliveryAreaMatch })[] {
  const location = new Set(locationPostalCodes)
  return restaurants.flatMap((restaurant) => {
    const served = new Set(
      restaurant.delivery_area_postal_codes.filter((code) =>
        location.has(code),
      ),
    ).size
    return served
      ? [
          {
            ...restaurant,
            delivery_area_match: {
              served_postal_codes: served,
              location_postal_codes: location.size,
            },
          },
        ]
      : []
  })
}
