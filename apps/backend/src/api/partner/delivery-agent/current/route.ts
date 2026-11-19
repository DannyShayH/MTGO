import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveCurrentDeliveryWorkflow } from "../../../../workflows/delivery/assignment"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveCurrentDeliveryWorkflow(req.scope).run({
    input: { agent_id: req.auth_context.actor_id },
  })
  res.json(result)
}
