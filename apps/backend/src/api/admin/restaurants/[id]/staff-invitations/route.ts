import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { inviteRestaurantStaffWorkflow } from "../../../../../workflows/restaurant-staff"
import { PostAdminInviteStaffBody } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminInviteStaffBody>,
  res: MedusaResponse,
) {
  const { result } = await inviteRestaurantStaffWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      name: req.validatedBody.name,
      email: req.validatedBody.email,
      invited_by: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
