import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listCustomerEmailChangeNoticesWorkflow } from "../../../workflows/customer-auth/list-customer-email-change-notices"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await listCustomerEmailChangeNoticesWorkflow(
    req.scope,
  ).run({ input: {} })
  res.json(result)
}
