import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveOrderDeliveryWorkflow } from "../../../../../workflows/delivery/location"

/**
 * The owning Customer's delivery milestones and the agent's latest location
 * with its freshness (#166), the contract #50's live map reads. Never
 * cached, so a delivery that ended shows no location on the next read.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveOrderDeliveryWorkflow(req.scope).run({
    input: { order_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
