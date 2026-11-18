import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { startPartnerOrderPreparationWorkflow } from "../../../../../workflows/order-operations"
import { PostPartnerOrderActionBody } from "../../../validators"

/**
 * Records that preparation started on one of the staff member's Restaurant's
 * accepted Orders, whether or not a Delivery agent is assigned.
 * The body is empty: time, actor and Restaurant come from the server and the
 * token.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerOrderActionBody>,
  res: MedusaResponse,
) {
  const { result } = await startPartnerOrderPreparationWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id, order_id: req.params.id },
  })
  res.json(result)
}
