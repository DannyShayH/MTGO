import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { revokeRestaurantStaffWorkflow } from "../../../../../../../workflows/restaurant-staff"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await revokeRestaurantStaffWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      staff_id: req.params.staff_id,
      revoked_by: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
