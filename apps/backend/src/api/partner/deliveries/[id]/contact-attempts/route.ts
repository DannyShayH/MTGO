import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { addContactAttemptWorkflow } from "../../../../../workflows/delivery/arrival"
import type { PostRecordContactAttemptBody } from "../../../validators"

/**
 * The responsible agent records one attempt to reach the Customer after
 * arrival (#164). The body carries only the attempt's retry identity: never
 * a time or whether the Customer answered.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostRecordContactAttemptBody>,
  res: MedusaResponse,
) {
  const { result } = await addContactAttemptWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      request_id: req.validatedBody.request_id,
    },
  })
  res.json(result)
}
