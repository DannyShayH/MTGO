import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { withResponseFields } from "../../common/response-fields"
import { AuthorizedStaff } from "../types"

/**
 * The refusal names the Restaurant whose access ended, so the partner app can
 * say "Your access to [Restaurant name] has ended" (spec story 43).
 */
export const staffAccessRevoked = (restaurant?: { name: string }) => {
  const error = new MedusaError(
    MedusaError.Types.FORBIDDEN,
    "staff_access_revoked",
    "staff_access_revoked",
  )
  return restaurant
    ? withResponseFields(error, { restaurant: { name: restaurant.name } })
    : error
}

/**
 * Every partner request starts here (ADR-0017): a token outlives a revocation,
 * so access is checked against the staff record, not the token. A token for a
 * staff member that does not exist is refused the same way.
 */
export const retrieveAuthorizedStaffStep = createStep(
  "retrieve-authorized-staff",
  async (input: { staff_id: string }, { container }) => {
    const [staff] = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listRestaurantStaffs(
        { id: input.staff_id },
        {
          select: [
            "id",
            "name",
            "email",
            "status",
            "restaurant.id",
            "restaurant.name",
          ],
          relations: ["restaurant"],
        },
      )
    if (!staff) throw staffAccessRevoked()
    if (staff.status !== "authorized")
      throw staffAccessRevoked(staff.restaurant)
    const authorized: AuthorizedStaff = {
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        status: staff.status,
        restaurant_id: staff.restaurant.id,
      },
      restaurant: { id: staff.restaurant.id, name: staff.restaurant.name },
    }
    return new StepResponse(authorized)
  },
)
