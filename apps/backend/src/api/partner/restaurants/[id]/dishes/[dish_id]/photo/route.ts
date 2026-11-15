import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { attachFirstPhotoWorkflow } from "../../../../../../../workflows/photos"
import type { PhotoInput } from "../../../../../../../workflows/photos/validation"

export async function POST(
  req: AuthenticatedMedusaRequest<PhotoInput>,
  res: MedusaResponse,
) {
  const { result } = await attachFirstPhotoWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      restaurant_id: req.params.id,
      resource_id: req.params.dish_id,
      kind: "dish",
      staff_id: req.auth_context.actor_id,
    },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json({ photo: result })
}
