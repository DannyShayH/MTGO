import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { requireVerifiedCustomerWorkflow } from "../../../../../workflows/customer-auth/require-verified-customer"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  await requireVerifiedCustomerWorkflow(req.scope).run({
    input: req.auth_context,
  })

  return res.json({ verified: true })
}
