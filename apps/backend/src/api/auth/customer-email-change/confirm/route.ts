import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { confirmCustomerEmailChangeWorkflow } from "../../../../workflows/customer-auth/confirm-customer-email-change"
import type { PostCustomerEmailChangeConfirmBody } from "../../../store/customers/me/email-change/validators"

export const AUTHENTICATE = false

export async function POST(
  req: MedusaRequest<PostCustomerEmailChangeConfirmBody>,
  res: MedusaResponse,
) {
  const { result } = await confirmCustomerEmailChangeWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json(result)
}
