import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { shareDeliveryLocationWorkflow } from "../../../../../workflows/delivery/location"
import type { PostShareDeliveryLocationBody } from "../../../validators"

/**
 * The responsible agent's phone replaces the latest position of its
 * collected delivery (#166). The agent comes from authentication and the
 * receipt time from the server; the coordinate is never logged or echoed.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostShareDeliveryLocationBody>,
  res: MedusaResponse,
) {
  const { latitude, longitude, accuracy_m, observed_at } = req.validatedBody
  const { result } = await shareDeliveryLocationWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      latitude,
      longitude,
      accuracy_m: accuracy_m ?? null,
      observed_at,
    },
  })
  res.json(result)
}
