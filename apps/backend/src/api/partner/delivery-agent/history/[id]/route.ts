import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveCompletedDeliveryWorkflow } from "../../../../../workflows/delivery/history"

/** One of the agent's own completed deliveries by Order id; anyone else's is not found (#161). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveCompletedDeliveryWorkflow(req.scope).run({
    input: { agent_id: req.auth_context.actor_id, order_id: req.params.id },
  })
  res.json(result)
}
