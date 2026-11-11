import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  createRestaurantWorkflow,
  listRestaurantsWorkflow,
} from "../../../workflows/restaurants"
import { RestaurantDetailsBody, RestaurantListQuery } from "./validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, RestaurantListQuery>,
  res: MedusaResponse,
) {
  const { result } = await listRestaurantsWorkflow(req.scope).run({
    input: req.validatedQuery,
  })
  res.json(result)
}
export async function POST(
  req: AuthenticatedMedusaRequest<RestaurantDetailsBody>,
  res: MedusaResponse,
) {
  const { result } = await createRestaurantWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json(result)
}
