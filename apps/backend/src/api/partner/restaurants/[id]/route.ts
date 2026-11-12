import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrievePartnerRestaurantWorkflow } from "../../../../workflows/restaurant-staff"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrievePartnerRestaurantWorkflow(req.scope).run({
    input: { id: req.params.id, staff_id: req.auth_context.actor_id },
  })
  res.json(result)
}
