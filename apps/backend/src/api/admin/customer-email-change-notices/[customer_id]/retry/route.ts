import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retryCustomerEmailChangeNoticeWorkflow } from "../../../../../workflows/customer-auth/retry-customer-email-change-notice"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retryCustomerEmailChangeNoticeWorkflow(
    req.scope,
  ).run({ input: { customer_id: req.params.customer_id } })
  res.json(result)
}
