import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { pickupAddressKey } from "../pickup-address-key"
import { RestaurantDetails } from "../types"

export const updateRestaurantStep = createStep(
  "update-restaurant",
  async (
    input: { id: string; details: Partial<RestaurantDetails> },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const previous = await service.retrieveRestaurant(input.id)
    const details = { ...previous, ...input.details }
    await service.updateRestaurants({
      id: input.id,
      ...input.details,
      pickup_address_key: pickupAddressKey(details),
    })
    return new StepResponse(details, previous)
  },
  async (previous, { container }) => {
    if (!previous) return
    const {
      id,
      name,
      address_street,
      address_postal_code,
      address_city,
      contact_email,
      contact_phone,
      pickup_address_key,
    } = previous
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateRestaurants({
        id,
        name,
        address_street,
        address_postal_code,
        address_city,
        contact_email,
        contact_phone,
        pickup_address_key,
      })
  },
)
