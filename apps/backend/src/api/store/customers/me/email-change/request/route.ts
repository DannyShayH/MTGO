import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { requestCustomerEmailChangeWorkflow } from "../../../../../../workflows/customer-auth/request-customer-email-change"
import type { PostCustomerEmailChangeRequestBody } from "../validators"

export async function POST(
  req: AuthenticatedMedusaRequest<PostCustomerEmailChangeRequestBody>,
  res: MedusaResponse,
) {
  const { result } = await requestCustomerEmailChangeWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      customer_id: req.auth_context.actor_id,
      ...req.validatedBody,
    },
  })
  res.status(201).json({ email: result.email, expires_at: result.expires_at })
}
