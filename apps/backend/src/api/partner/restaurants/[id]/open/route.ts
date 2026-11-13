import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { openRestaurantWorkflow } from "../../../../../workflows/restaurant-staff"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await openRestaurantWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
