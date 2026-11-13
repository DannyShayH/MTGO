import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { deactivateRestaurantWorkflow } from "../../../../../workflows/restaurants"
import { PostAdminDeactivateRestaurantBody } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminDeactivateRestaurantBody>,
  res: MedusaResponse,
) {
  const { result } = await deactivateRestaurantWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      operator_id: req.auth_context.actor_id,
      reason: req.validatedBody.reason,
    },
  })
  res.json(result)
}
