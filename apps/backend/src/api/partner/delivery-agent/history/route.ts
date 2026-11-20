import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listCompletedDeliveriesWorkflow } from "../../../../workflows/delivery/history"
import type { GetCompletedDeliveriesQuery } from "../../validators"

/** The agent's own completed deliveries, newest first, without Customer contact (#161). */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetCompletedDeliveriesQuery>,
  res: MedusaResponse,
) {
  const { result } = await listCompletedDeliveriesWorkflow(req.scope).run({
    input: {
      agent_id: req.auth_context.actor_id,
      ...(req.validatedQuery as GetCompletedDeliveriesQuery),
    },
  })
  res.json(result)
}
