import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { activateRestaurantWorkflow } from "../../../../../workflows/restaurants"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await activateRestaurantWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      operator_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
