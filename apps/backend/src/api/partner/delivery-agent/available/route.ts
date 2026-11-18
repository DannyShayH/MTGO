import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listAvailableDeliveriesWorkflow } from "../../../../workflows/delivery/available"
import type { GetAvailableDeliveriesQuery } from "../../validators"

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetAvailableDeliveriesQuery>,
  res: MedusaResponse,
) {
  const { result } = await listAvailableDeliveriesWorkflow(req.scope).run({
    input: {
      agent_id: req.auth_context.actor_id,
      ...(req.validatedQuery as GetAvailableDeliveriesQuery),
    },
  })
  res.json(result)
}
