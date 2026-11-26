import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveDeliveryAgentSessionWorkflow } from "../../../../workflows/delivery/session"
import { isFeatureReleased } from "../../../feature-flag"
import AgentBonusFeatureFlag from "../../../../feature-flags/agent-bonus"

/**
 * The signed-in Delivery agent with their approved areas, and the
 * backend-owned Features the workspace shows navigation for (ADR-0022), so
 * the app never asks a hidden route just to decide on a link (#252).
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveDeliveryAgentSessionWorkflow(req.scope).run({
    input: { agent_id: req.auth_context.actor_id },
  })
  res.json({
    ...result,
    features: {
      agent_bonus: isFeatureReleased(req.scope, AgentBonusFeatureFlag.key),
    },
  })
}
