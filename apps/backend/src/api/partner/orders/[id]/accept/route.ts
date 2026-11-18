import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { acceptPartnerOrderWorkflow } from "../../../../../workflows/order-operations"
import { PostPartnerAcceptOrderBody } from "../../../validators"

/**
 * Accepts one of the staff member's Restaurant's awaiting Orders. The body is
 * empty: time, actor and Restaurant come from the server and the token.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostPartnerAcceptOrderBody>,
  res: MedusaResponse,
) {
  const { result } = await acceptPartnerOrderWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id, order_id: req.params.id },
  })
  res.json(result)
}
