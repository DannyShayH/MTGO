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
