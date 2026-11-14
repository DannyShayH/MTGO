import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { requestCustomerVerificationEmailWorkflow } from "../../../../workflows/customer-auth/request-customer-verification-email"
import type { PostCustomerVerificationRequestBody } from "../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostCustomerVerificationRequestBody>,
  res: MedusaResponse,
) {
  await requestCustomerVerificationEmailWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      ...req.validatedBody,
    },
  })

  res.json({ success: true })
}
