import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { cancelCustomerOrderWorkflow } from "../../../../../workflows/order-operations"
import type { PostStoreCancelOrderBody } from "../../validators"

/**
 * The owning Customer cancels their awaiting Order before Restaurant
 * acceptance and is fully refunded. Answers with the Order's progress after
 * the request: the cancellation and refund outcome, or the recorded outcome
 * for a repeat.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostStoreCancelOrderBody>,
  res: MedusaResponse,
) {
  const { result } = await cancelCustomerOrderWorkflow(req.scope).run({
    input: { customer_id: req.auth_context.actor_id, order_id: req.params.id },
  })
  res.json(result)
}
