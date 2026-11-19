import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { assignDeliveryWorkflow } from "../../../../../workflows/delivery/assignment"
import type { AssignDeliveryBody } from "../../validators"

/** The operator comes from authentication and is recorded apart from the agent. */
export async function POST(
  req: AuthenticatedMedusaRequest<AssignDeliveryBody>,
  res: MedusaResponse,
) {
  const { result } = await assignDeliveryWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.validatedBody.agent_id,
      request_id: req.validatedBody.request_id,
      operator_id: req.auth_context.actor_id,
    },
  })
  res.json({ assignment: result })
}
