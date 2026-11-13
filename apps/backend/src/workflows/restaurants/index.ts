import {
  createWorkflow,
  WorkflowResponse,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk"
import { RestaurantDetails } from "./types"
import { createRestaurantStep } from "./steps/create-restaurant"
import { updateRestaurantStep } from "./steps/update-restaurant"
import {
  acquireLockStep,
  emitEventStep,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
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
import { restaurantLock } from "./restaurant-lock"
import { activateRestaurantStep } from "./steps/activate-restaurant"
import { deactivateRestaurantStep } from "./steps/deactivate-restaurant"
import {
  ListRestaurantHistoryInput,
  listRestaurantHistoryStep,
  recordRestaurantHistoryEntriesStep,
} from "./steps/history"

export const RESTAURANT_ACTIVATED = "restaurant.activated"
export const RESTAURANT_DEACTIVATED = "restaurant.deactivated"
export const RESTAURANT_CLOSED = "restaurant.closed"

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
/** Activate from Admin: checked again under the Restaurant's lock, so a stale page cannot activate (spec story 29). */
export const activateRestaurantWorkflow = createWorkflow(
  "activate-restaurant",
  function (input: { restaurant_id: string; operator_id: string }) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    const activation = activateRestaurantStep({
      restaurant_id: input.restaurant_id,
    })
    // Activating an active Restaurant records nothing and emits nothing (spec story 36).
    when({ activation }, ({ activation }) => activation.has_activated).then(
      () => {
        const history = transform({ input }, ({ input }) => ({
          entries: [
            {
              restaurant_id: input.restaurant_id,
              kind: "activated" as const,
              actor: { type: "user" as const, id: input.operator_id },
            },
          ],
        }))
        recordRestaurantHistoryEntriesStep(history)
        emitEventStep({
          eventName: RESTAURANT_ACTIVATED,
          data: { id: input.restaurant_id },
        })
      },
    )
    releaseLockStep(lock)
    return new WorkflowResponse({
      restaurant: retrieveRestaurantDetailStep({ id: input.restaurant_id }),
    })
  },
)
/**
 * Deactivate from Admin with a reason: Inactive and Closed, under the
 * Restaurant's lock so it cannot race opening (spec stories 31, 32 and 36).
 * Closing an open Restaurant is recorded with the operator as the actor.
 */
export const deactivateRestaurantWorkflow = createWorkflow(
  "deactivate-restaurant",
  function (input: {
    restaurant_id: string
    operator_id: string
    reason: string
  }) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    const deactivation = deactivateRestaurantStep({
      restaurant_id: input.restaurant_id,
    })
    when(
      { deactivation },
      ({ deactivation }) => deactivation.kinds.length > 0,
    ).then(() => {
      const history = transform(
        { input, deactivation },
        ({ input, deactivation }) => ({
          entries: deactivation.kinds.map((kind) => ({
            restaurant_id: input.restaurant_id,
            kind,
            actor: { type: "user" as const, id: input.operator_id },
            ...(kind === "deactivated" ? { reason: input.reason } : {}),
          })),
        }),
      )
      recordRestaurantHistoryEntriesStep(history)
      emitEventStep({
        eventName: RESTAURANT_DEACTIVATED,
        data: { id: input.restaurant_id },
      })
    })
    // Closing by deactivation is a closing too, so listeners for closings miss none.
    when({ deactivation }, ({ deactivation }) =>
      deactivation.kinds.includes("closed"),
    ).then(() => {
      emitEventStep({
        eventName: RESTAURANT_CLOSED,
        data: { id: input.restaurant_id },
      }).config({ name: "emit-restaurant-closed" })
    })
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
export const listRestaurantHistoryWorkflow = createWorkflow(
  "list-restaurant-history",
  function (input: ListRestaurantHistoryInput) {
    return new WorkflowResponse(listRestaurantHistoryStep(input))
  },
)
