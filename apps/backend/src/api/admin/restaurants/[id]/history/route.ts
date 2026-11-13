import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listRestaurantHistoryWorkflow } from "../../../../../workflows/restaurants"
import { RestaurantHistoryListQuery } from "../../validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, RestaurantHistoryListQuery>,
  res: MedusaResponse,
) {
  const { result } = await listRestaurantHistoryWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id, ...req.validatedQuery },
  })
  res.json(result)
}
