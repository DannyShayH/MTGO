import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readAgentBonusWorkflow } from "../../../../workflows/agent-bonus/read"

/** Current-month points and estimate for the authenticated Delivery agent (#236, #237). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readAgentBonusWorkflow(req.scope).run({
    input: { agent_id: req.auth_context.actor_id },
  })
  res.json(result)
}
