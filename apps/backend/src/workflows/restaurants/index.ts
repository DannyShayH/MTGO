import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { RestaurantDetails } from "./types"
import { createRestaurantStep } from "./steps/create-restaurant"
import { updateRestaurantStep } from "./steps/update-restaurant"
import {
  readRestaurantsStep,
  checkPickupAddressStep,
} from "./steps/read-restaurants"

export const listRestaurantsWorkflow = createWorkflow(
  "list-restaurants",
  function (input: { q?: string; limit: number; offset: number }) {
    return new WorkflowResponse(readRestaurantsStep(input))
  },
)
export const retrieveRestaurantWorkflow = createWorkflow(
  "retrieve-restaurant",
  function (input: { id: string }) {
    const result = readRestaurantsStep({ id: input.id, limit: 1, offset: 0 })
    const restaurant = transform(
      { result },
      ({ result }) => result.restaurants[0],
    )
    return new WorkflowResponse({ restaurant })
  },
)
export const checkPickupAddressWorkflow = createWorkflow(
  "check-pickup-address",
  function (input: {
    address: Pick<
      RestaurantDetails,
      "address_street" | "address_postal_code" | "address_city"
    >
    exclude_id?: string
  }) {
    return new WorkflowResponse({ warnings: checkPickupAddressStep(input) })
  },
)
export const createRestaurantWorkflow = createWorkflow(
  "create-restaurant",
  function (input: RestaurantDetails) {
    const warnings = checkPickupAddressStep({ address: input })
    const id = createRestaurantStep(input)
    const result = readRestaurantsStep({ id, limit: 1, offset: 0 })
    return new WorkflowResponse({ restaurant: result.restaurants[0], warnings })
  },
)
export const updateRestaurantWorkflow = createWorkflow(
  "update-restaurant",
  function (input: { id: string; details: Partial<RestaurantDetails> }) {
    const updated = updateRestaurantStep(input)
    const warnings = checkPickupAddressStep({
      address: updated,
      exclude_id: input.id,
    })
    const result = readRestaurantsStep({ id: updated.id, limit: 1, offset: 0 })
    return new WorkflowResponse({ restaurant: result.restaurants[0], warnings })
  },
)
