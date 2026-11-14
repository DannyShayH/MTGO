import { MedusaError } from "@medusajs/framework/utils"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  createMenuDishWorkflow,
  listMenuDishesWorkflow,
} from "../../../../../workflows/menu-dishes"
import { DishCreateInput } from "../../../../../workflows/menu-dishes/validation"

export async function POST(
  req: AuthenticatedMedusaRequest<DishCreateInput>,
  res: MedusaResponse,
) {
  const { result } = await createMenuDishWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      restaurant_id: req.params.id,
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

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await listMenuDishesWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
