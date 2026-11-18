import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveDeliveryAgentSessionWorkflow } from "../../../../workflows/delivery/session"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveDeliveryAgentSessionWorkflow(req.scope).run({
    input: { agent_id: req.auth_context.actor_id },
  })
  res.json(result)
}
