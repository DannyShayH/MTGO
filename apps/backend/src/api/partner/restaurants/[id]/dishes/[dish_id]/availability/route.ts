import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { changeMenuDishAvailabilityWorkflow } from "../../../../../../../workflows/menu-dishes"
import { DishAvailabilityInput } from "../../../../../../../workflows/menu-dishes/validation"

export async function POST(
  req: AuthenticatedMedusaRequest<DishAvailabilityInput>,
  res: MedusaResponse,
) {
  const { result } = await changeMenuDishAvailabilityWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      restaurant_id: req.params.id,
      dish_id: req.params.dish_id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
