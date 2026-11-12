import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import PostalCodeModuleService from "../../../modules/postal-code/service"
import { POSTAL_CODE_MODULE } from "../../../modules/postal-code"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { planDeliveryAreaChange } from "../delivery-area-change"
import { assertRestaurantExists } from "./restaurant-exists"

export type DeliveryAreaChange = {
  restaurant_id: string
  add: string[]
  remove: string[]
}

/** A delivery area holds only postal codes that exist in the Danish register. */
export const validateRegisteredPostalCodesStep = createStep(
  "validate-registered-postal-codes",
  async (input: { postal_codes: string[] }, { container }) => {
    if (!input.postal_codes.length) return new StepResponse(undefined)
    const registered = await container
      .resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
      .listPostalCodes(
        { postal_code: input.postal_codes },
        { take: null, select: ["postal_code"] },
      )
    const known = new Set(registered.map(({ postal_code }) => postal_code))
    const unknown = [...new Set(input.postal_codes)]
      .filter((code) => !known.has(code))
      .sort((a, b) => a.localeCompare(b))
    if (unknown.length)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `postal_code_invalid: ${unknown.join(", ")}`,
        "postal_code_invalid",
      )
    return new StepResponse(undefined)
  },
)

/** Adds and removes postal codes in one change; codes already served or not served change nothing. */
export const changeDeliveryAreaStep = createStep(
  "change-delivery-area",
  async (input: DeliveryAreaChange, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    const current = await service.listDeliveryAreaPostalCodes(
      { restaurant_id: input.restaurant_id },
      { take: null, select: ["id", "postal_code"] },
    )
    const plan = planDeliveryAreaChange({
      current: current.map(({ postal_code }) => postal_code),
      add: input.add,
      remove: input.remove,
    })
    const removedIds = current
      .filter(({ postal_code }) => plan.remove.includes(postal_code))
      .map(({ id }) => id)
    if (removedIds.length)
      await service.softDeleteDeliveryAreaPostalCodes(removedIds)
    const created = plan.create.length
      ? await service.createDeliveryAreaPostalCodes(
          plan.create.map((postal_code) => ({
            restaurant_id: input.restaurant_id,
            postal_code,
          })),
        )
      : []
    return new StepResponse(undefined, {
      createdIds: created.map(({ id }) => id),
      removedIds,
    })
  },
  async (undo, { container }) => {
    if (!undo) return
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    if (undo.createdIds.length)
      await service.deleteDeliveryAreaPostalCodes(undo.createdIds)
    if (undo.removedIds.length)
      await service.restoreDeliveryAreaPostalCodes(undo.removedIds)
  },
)
