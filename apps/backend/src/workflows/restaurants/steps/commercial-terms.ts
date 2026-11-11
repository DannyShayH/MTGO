import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { TermsVersion } from "../commercial-terms"
import { assertRestaurantExists } from "./restaurant-exists"

const findAgreements = (service: RestaurantModuleService, id: string) =>
  service.listCommercialTermsAgreements(
    { restaurant_id: id },
    { select: ["id"] },
  )

/** Recording terms the Restaurant already agreed to keeps the original date and operator. */
export const recordCommercialTermsStep = createStep(
  "record-commercial-terms",
  async (
    input: {
      restaurant_id: string
      terms_version: TermsVersion
      recorded_by: string
    },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    if ((await findAgreements(service, input.restaurant_id)).length)
      return new StepResponse(undefined, undefined)
    const created = await service.createCommercialTermsAgreements({
      ...input,
      agreed_at: new Date(),
    })
    return new StepResponse(undefined, created.id)
  },
  async (createdId, { container }) => {
    if (createdId)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteCommercialTermsAgreements(createdId)
  },
)

/** Soft-deletes the current agreement so the record of who agreed when is kept (ADR-0014). */
export const removeCommercialTermsStep = createStep(
  "remove-commercial-terms",
  async (input: { restaurant_id: string }, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    const ids = (await findAgreements(service, input.restaurant_id)).map(
      ({ id }) => id,
    )
    if (ids.length) await service.softDeleteCommercialTermsAgreements(ids)
    return new StepResponse(undefined, ids)
  },
  async (ids, { container }) => {
    if (ids?.length)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .restoreCommercialTermsAgreements(ids)
  },
)
