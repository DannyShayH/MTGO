import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { editMenuDishWorkflow } from "../../../../../../workflows/menu-dishes"
import { DishEditInput } from "../../../../../../workflows/menu-dishes/validation"

export async function POST(
  req: AuthenticatedMedusaRequest<DishEditInput>,
  res: MedusaResponse,
) {
  const { result } = await editMenuDishWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      restaurant_id: req.params.id,
      dish_id: req.params.dish_id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.setHeader("Cache-Control", "no-store")
  if (!result.confirmed)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "dish_publication_uncertain",
      "dish_publication_uncertain",
    )
  res.json({ categories: result.categories })
}
