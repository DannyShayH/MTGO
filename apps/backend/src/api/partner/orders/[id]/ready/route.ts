import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { markPartnerOrderReadyWorkflow } from "../../../../../workflows/order-operations"
import { PostPartnerOrderActionBody } from "../../../validators"

/**
 * Records that the food is ready on one of the staff member's Restaurant's
 * Orders whose preparation started. It records no pickup or delivery.
 * The body is empty: time, actor and Restaurant come from the server and the
 * token.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerOrderActionBody>,
  res: MedusaResponse,
) {
  const { result } = await markPartnerOrderReadyWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id, order_id: req.params.id },
  })
  res.json(result)
}
