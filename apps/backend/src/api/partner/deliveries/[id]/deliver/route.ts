import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { confirmHandoverWorkflow } from "../../../../../workflows/delivery/terminal"
import type { PostConfirmHandoverBody } from "../../../validators"

/**
 * The responsible agent confirms actual handover to the Customer or the
 * designated recipient (#161). The agent comes from authentication and the
 * time from the server; the body carries only the retry identity.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostConfirmHandoverBody>,
  res: MedusaResponse,
) {
  const { result } = await confirmHandoverWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      request_id: req.validatedBody.request_id,
    },
  })
  res.json(result)
}
