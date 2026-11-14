import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { mutateMenuCategoryWorkflow } from "../../../../../../workflows/menu-categories"
import {
  PostPartnerRenameCategoryBody,
  DeletePartnerCategoryBody,
} from "../../../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerRenameCategoryBody>,
  res: MedusaResponse,
) {
  const { result } = await mutateMenuCategoryWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      kind: "rename",
      category_id: req.params.category_id,
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}

export async function DELETE(
  req: AuthenticatedMedusaRequest<DeletePartnerCategoryBody>,
  res: MedusaResponse,
) {
  const { result } = await mutateMenuCategoryWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      kind: "remove",
      category_id: req.params.category_id,
      restaurant_id: req.params.id,
      staff_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
