import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  retrieveRestaurantWorkflow,
  updateRestaurantWorkflow,
} from "../../../../workflows/restaurants"
import { RestaurantUpdateBody } from "../validators"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveRestaurantWorkflow(req.scope).run({
    input: { id: req.params.id },
  })
  res.json(result)
}
export async function POST(
  req: AuthenticatedMedusaRequest<RestaurantUpdateBody>,
  res: MedusaResponse,
) {
  const { result } = await updateRestaurantWorkflow(req.scope).run({
    input: { id: req.params.id, details: req.validatedBody },
  })
  res.json(result)
}
