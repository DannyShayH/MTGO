import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  recordCommercialTermsWorkflow,
  removeCommercialTermsWorkflow,
} from "../../../../../workflows/restaurants"
import { PostAdminRecordCommercialTermsBody } from "../../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminRecordCommercialTermsBody>,
  res: MedusaResponse,
) {
  const { result } = await recordCommercialTermsWorkflow(req.scope).run({
    input: {
      restaurant_id: req.params.id,
      terms_version: req.validatedBody.terms_version,
      recorded_by: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await removeCommercialTermsWorkflow(req.scope).run({
    input: { restaurant_id: req.params.id },
  })
  res.json(result)
}
