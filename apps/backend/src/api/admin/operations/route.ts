import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readOperationsWorkflow } from "../../../workflows/operations-monitoring"

/**
 * @oas [get] /admin/operations
 * operationId: GetAdminOperations
 * summary: Get the platform's operations figures
 * description: Returns the moment the figures were calculated for and, across all Restaurants, the Open Orders as a total and by stage (awaiting acceptance, accepted or preparing, ready without an agent, assigned without pickup, picked up without handover), the unassigned deliveries with those waiting over ten minutes, the outstanding attention items by type (marking unassigned items that are the same Orders as the waiting deliveries) and the unresolved Full refunds as pending and failed. The stages always add up to the total. Behind the operations_monitoring flag.
 * x-authenticated: true
 * responses:
 *   "200":
 *     description: Operations figures
 *   "401":
 *     description: Not signed in as an operator
 *   "404":
 *     description: The operations_monitoring flag is off
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readOperationsWorkflow(req.scope).run({
    input: { scope: { type: "platform" }, now: new Date().toISOString() },
  })
  res.json(result)
}
