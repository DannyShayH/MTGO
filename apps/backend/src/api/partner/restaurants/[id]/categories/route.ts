import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  listMenuCategoriesWorkflow,
  mutateMenuCategoryWorkflow,
} from "../../../../../workflows/menu-categories"
import { PostPartnerCreateCategoryBody } from "../../../validators"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await listMenuCategoriesWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}

export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerCreateCategoryBody>,
  res: MedusaResponse,
) {
  const { result } = await mutateMenuCategoryWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      kind: "create",
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
