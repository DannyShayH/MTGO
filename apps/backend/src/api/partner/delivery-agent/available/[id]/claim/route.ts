import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { claimDeliveryWorkflow } from "../../../../../../workflows/delivery/assignment"
import type { PostClaimDeliveryBody } from "../../../../validators"

/** The agent comes from authentication; the body carries only the retry identity. */
export async function POST(
  req: AuthenticatedMedusaRequest<PostClaimDeliveryBody>,
  res: MedusaResponse,
) {
  const { result } = await claimDeliveryWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      request_id: req.validatedBody.request_id,
    },
  })
  res.json(result)
}
