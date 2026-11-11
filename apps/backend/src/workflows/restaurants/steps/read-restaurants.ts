import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { evaluateNewOrderEligibility } from "../eligibility"
import { pickupAddressKey } from "../pickup-address-key"
import { RestaurantDetails, AddressWarning } from "../types"

type ReadInput = { id?: string; q?: string; limit: number; offset: number }
export const readRestaurantsStep = createStep(
  "read-restaurants",
  async (input: ReadInput, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const filters = input.id ? { id: input.id } : input.q ? { q: input.q } : {}
    const [records, count] = await service.listAndCountRestaurants(filters, {
      skip: input.offset,
      take: input.limit,
      order: { created_at: "DESC", id: "ASC" },
    })
    if (input.id && !records.length)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "restaurant_not_found",
        "restaurant_not_found",
      )
    // Delivery areas arrive in #72. Registration cannot activate or open a Restaurant.
    const restaurants = records.map(
      ({ pickup_address_key: _key, ...restaurant }) => ({
        ...restaurant,
        ...evaluateNewOrderEligibility({
          is_active: restaurant.is_active,
          is_open: restaurant.is_open,
          delivery_postal_codes: [],
        }),
      }),
    )
    return new StepResponse({
      restaurants,
      count,
      limit: input.limit,
      offset: input.offset,
    })
  },
)

export const checkPickupAddressStep = createStep(
  "check-pickup-address",
  async (
    input: {
      address: Pick<
        RestaurantDetails,
        "address_street" | "address_postal_code" | "address_city"
      >
      exclude_id?: string
    },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const matches = await service.listRestaurants(
      {
        pickup_address_key: pickupAddressKey(input.address),
        ...(input.exclude_id ? { id: { $ne: input.exclude_id } } : {}),
      },
      { take: null, select: ["id"] },
    )
    const warnings: AddressWarning[] = matches.length
      ? [
          {
            code: "same_pickup_address",
            restaurant_ids: matches.map((restaurant) => restaurant.id),
          },
        ]
      : []
    return new StepResponse(warnings)
  },
)
