import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { assertRestaurantExists } from "../../restaurants/steps/restaurant-exists"

export type RevokeStaffInput = {
  restaurant_id: string
  staff_id: string
  revoked_by: string
}

export const authorizedStaffNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "authorized_staff_not_found",
    "authorized_staff_not_found",
  )

/**
 * Marks authorized staff revoked with time and operator. The record stays, so
 * history keeps the person's name (ADR-0008, ADR-0014). Revoking staff that is
 * already revoked changes nothing and keeps the first revocation. Pending staff
 * are cancelled instead, so they are not found here.
 */
export const revokeStaffStep = createStep(
  "revoke-staff",
  async (input: RevokeStaffInput, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    const [staff] = await service.listRestaurantStaffs(
      {
        id: input.staff_id,
        restaurant_id: input.restaurant_id,
        status: ["authorized", "revoked"],
      },
      { select: ["id", "status"] },
    )
    if (!staff) throw authorizedStaffNotFound()
    if (staff.status === "revoked") return new StepResponse(undefined)
    await service.updateRestaurantStaffs({
      id: staff.id,
      status: "revoked",
      revoked_at: new Date(),
      revoked_by: input.revoked_by,
    })
    return new StepResponse(undefined, staff.id)
  },
  async (staffId, { container }) => {
    if (!staffId) return
    await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .updateRestaurantStaffs({
        id: staffId,
        status: "authorized",
        revoked_at: null,
        revoked_by: null,
      })
  },
)
