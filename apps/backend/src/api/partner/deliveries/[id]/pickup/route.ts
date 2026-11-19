import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { confirmPickupWorkflow } from "../../../../../workflows/delivery/pickup"
import type { PostConfirmPickupBody } from "../../../validators"

/**
 * The responsible agent confirms collecting ready food (#160). The agent
 * comes from authentication and the time from the server; the body carries
 * only the retry identity.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostConfirmPickupBody>,
  res: MedusaResponse,
) {
  const { result } = await confirmPickupWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      request_id: req.validatedBody.request_id,
    },
  })
  res.json(result)
}
