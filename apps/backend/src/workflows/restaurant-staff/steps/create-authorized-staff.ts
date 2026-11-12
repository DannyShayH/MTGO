import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { assertRestaurantExists } from "../../restaurants/steps/restaurant-exists"

export type AuthorizedStaffInput = {
  restaurant_id: string
  name: string
  email: string
}

/** Creates staff who are authorized straight away, as accepting an invitation will (#74). */
export const createAuthorizedStaffStep = createStep(
  "create-authorized-staff",
  async (input: AuthorizedStaffInput, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    const staff = await service.createRestaurantStaffs({
      ...input,
      status: "authorized",
      accepted_at: new Date(),
    })
    return new StepResponse(staff.id, staff.id)
  },
  async (id, { container }) => {
    if (id)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteRestaurantStaffs(id)
  },
)
