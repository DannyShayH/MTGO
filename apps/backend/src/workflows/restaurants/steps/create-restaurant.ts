import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { pickupAddressKey } from "../pickup-address-key"
import { RestaurantDetails } from "../types"

export const createRestaurantStep = createStep(
  "create-restaurant",
  async (input: RestaurantDetails, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const restaurant = await service.createRestaurants({
      ...input,
      pickup_address_key: pickupAddressKey(input),
    })
    return new StepResponse(restaurant.id, restaurant.id)
  },
  async (id, { container }) => {
    if (id)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteRestaurants(id)
  },
)
