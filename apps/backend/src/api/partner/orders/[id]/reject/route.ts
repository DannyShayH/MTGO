import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { rejectPartnerOrderWorkflow } from "../../../../../workflows/order-operations"
import { PostPartnerRejectOrderBody } from "../../../validators"

/**
 * Rejects one of the staff member's Restaurant's awaiting Orders with an
 * optional reason. Time, actor, Restaurant and refund amount come from the
 * server and the token.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerRejectOrderBody>,
  res: MedusaResponse,
) {
  const { result } = await rejectPartnerOrderWorkflow(req.scope).run({
    input: {
      staff_id: req.auth_context.actor_id,
      order_id: req.params.id,
      note: req.validatedBody.reason,
    },
  })
  res.json(result)
}
