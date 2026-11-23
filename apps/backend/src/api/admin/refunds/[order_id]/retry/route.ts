import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retryFullRefundWorkflow } from "../../../../../workflows/order-operations"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retryFullRefundWorkflow(req.scope).run({
    input: {
      order_id: req.params.order_id,
      actor_id: req.auth_context.actor_id,
    },
  })
  res.json({ refund: result })
}
