import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { RestaurantDetails } from "./types"
import { createRestaurantStep } from "./steps/create-restaurant"
import { updateRestaurantStep } from "./steps/update-restaurant"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import {
  readRestaurantsStep,
  retrieveRestaurantDetailStep,
  checkPickupAddressStep,
} from "./steps/read-restaurants"
import {
  changeDeliveryAreaStep,
  DeliveryAreaChange,
  validateRegisteredPostalCodesStep,
} from "./steps/delivery-area"
import {
  recordCommercialTermsStep,
  removeCommercialTermsStep,
} from "./steps/commercial-terms"
import { TermsVersion } from "./commercial-terms"

export const listRestaurantsWorkflow = createWorkflow(
  "list-restaurants",
  function (input: { q?: string; limit: number; offset: number }) {
    return new WorkflowResponse(readRestaurantsStep(input))
  },
)
export const retrieveRestaurantWorkflow = createWorkflow(
  "retrieve-restaurant",
  function (input: { id: string }) {
    return new WorkflowResponse({
      restaurant: retrieveRestaurantDetailStep({ id: input.id }),
    })
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
    const restaurant = retrieveRestaurantDetailStep({ id })
    return new WorkflowResponse({ restaurant, warnings })
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
    const restaurant = retrieveRestaurantDetailStep({ id: input.id })
    return new WorkflowResponse({ restaurant, warnings })
  },
)

/** Setup changes to one Restaurant are serialized so later guards cannot race them. */
const restaurantLock = (restaurant_id: string) => ({
  key: `restaurant:${restaurant_id}`,
  timeout: 5,
  ttl: 30,
})

/** Single-code and batch routes share this workflow: one locked, all-or-nothing change. */
export const changeDeliveryAreaWorkflow = createWorkflow(
  "change-delivery-area",
  function (input: DeliveryAreaChange) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    validateRegisteredPostalCodesStep({ postal_codes: input.add })
    changeDeliveryAreaStep(input)
    releaseLockStep(lock)
    return new WorkflowResponse({
      restaurant: retrieveRestaurantDetailStep({ id: input.restaurant_id }),
    })
  },
)
export const recordCommercialTermsWorkflow = createWorkflow(
  "record-commercial-terms",
  function (input: {
    restaurant_id: string
    terms_version: TermsVersion
    recorded_by: string
  }) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    recordCommercialTermsStep(input)
    releaseLockStep(lock)
    return new WorkflowResponse({
      restaurant: retrieveRestaurantDetailStep({ id: input.restaurant_id }),
    })
  },
)
export const removeCommercialTermsWorkflow = createWorkflow(
  "remove-commercial-terms",
  function (input: { restaurant_id: string }) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    removeCommercialTermsStep(input)
    releaseLockStep(lock)
    return new WorkflowResponse({
      restaurant: retrieveRestaurantDetailStep({ id: input.restaurant_id }),
    })
  },
)
