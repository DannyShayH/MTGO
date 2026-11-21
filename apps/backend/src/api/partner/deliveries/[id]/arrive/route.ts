import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { confirmArrivalWorkflow } from "../../../../../workflows/delivery/arrival"
import type { PostRecordArrivalBody } from "../../../validators"

/**
 * The responsible agent records reaching the destination (#164). The agent
 * comes from authentication and the time from the server; the body carries
 * only the retry identity, never a location.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostRecordArrivalBody>,
  res: MedusaResponse,
) {
  const { result } = await confirmArrivalWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      request_id: req.validatedBody.request_id,
    },
  })
  res.json(result)
}
