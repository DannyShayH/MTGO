import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listRestaurantHistoryWorkflow } from "../../../../../workflows/restaurants"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await listRestaurantHistoryWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id },
  })
  res.json(result)
}
