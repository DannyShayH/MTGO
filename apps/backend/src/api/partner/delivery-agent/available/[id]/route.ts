import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { listAvailableDeliveriesWorkflow } from "../../../../../workflows/delivery/available"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await listAvailableDeliveriesWorkflow(req.scope).run({
    input: {
      agent_id: req.auth_context.actor_id,
      order_id: req.params.id,
      limit: 1,
      offset: 0,
    },
  })
  if (!result.deliveries.length)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "delivery_not_found")
  res.json({ delivery: result.deliveries[0], server_time: result.server_time })
}
