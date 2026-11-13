import { MedusaError } from "@medusajs/framework/utils"
import RestaurantModuleService from "../../../modules/restaurant/service"

export const restaurantNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "restaurant_not_found",
    "restaurant_not_found",
  )

export async function assertRestaurantExists(
  service: RestaurantModuleService,
  id: string,
) {
  const [restaurant] = await service.listRestaurants({ id }, { select: ["id"] })
  if (!restaurant) throw restaurantNotFound()
}

/**
 * The Restaurant's `is_active` and `is_open`, or `restaurant_not_found`.
 * Callers that guard on it hold the Restaurant's lock, so the read cannot race
 * activation, deactivation or opening.
 */
export async function readParticipationOrThrow(
  service: RestaurantModuleService,
  id: string,
) {
  const [restaurant] = await service.listRestaurants(
    { id },
    { select: ["id", "is_active", "is_open"] },
  )
  if (!restaurant) throw restaurantNotFound()
  return { is_active: restaurant.is_active, is_open: restaurant.is_open }
}
