import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { revokeDeliveryAgentWorkflow } from "../../../../../workflows/delivery/agents"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await revokeDeliveryAgentWorkflow(req.scope).run({
    input: { agent_id: req.params.id, revoked_by: req.auth_context.actor_id },
  })
  res.json({ agent: result })
}
