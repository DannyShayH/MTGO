import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readAdminOperationsWorkflow } from "../../../workflows/operations-monitoring"
import type { GetAdminOperationsQuery } from "./validators"

/**
 * @oas [get] /admin/operations
 * operationId: GetAdminOperations
 * summary: Get the platform's or one Restaurant's operations figures
 * description: Returns the moment the figures were calculated for and, across all Restaurants, the Open Orders as a total and by stage (awaiting acceptance, accepted or preparing, ready without an agent, assigned without pickup, picked up without handover), the unassigned deliveries with those waiting over ten minutes, the outstanding attention items by type (marking unassigned items that are the same Orders as the waiting deliveries), the unresolved Full refunds as pending and failed, the Orders placed in the last 24 hours with those now cancelled by category, placements in each of the 24 Copenhagen clock hours ending with the current one (marked so far, each with its UTC offset), and placements on each of the previous seven complete Copenhagen days with their average (total divided by seven), and, for the Orders handed over in the last 24 hours, the average Order processing time (placement to handover) and Delivery transit time (pickup to handover), each with the Orders included, those excluded by reason (no placement, handover or pickup time) and the change from the previous seven days, plus both times over the previous seven complete Copenhagen days with one average per day, the Unfulfilled Order rate among the Orders placed in the last 24 hours (cancelled or not delivered, of those ended) by cause with the Orders still open shown apart, and the platform-wide average Customer experience rating and number of ratings for the last 30 days as the Feedback statistics read gives it. The stages always add up to the total, and the causes to the Unfulfilled Orders. With restaurant_id, every figure is narrowed to that one Restaurant (also a deactivated one) with the same definitions its staff see, and the Customer rating is null. Behind the operations_monitoring flag.
 * x-authenticated: true
 * parameters:
 *   - name: restaurant_id
 *     in: query
 *     required: false
 *     schema:
 *       type: string
 *     description: One Restaurant; all Restaurants when left out.
 * responses:
 *   "200":
 *     description: Operations figures
 *   "400":
 *     description: An empty or unknown query parameter
 *   "401":
 *     description: Not signed in as an operator
 *   "404":
 *     description: The operations_monitoring flag is off, or no such Restaurant
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetAdminOperationsQuery>,
  res: MedusaResponse,
) {
  const { restaurant_id } = req.validatedQuery
  const { result } = await readAdminOperationsWorkflow(req.scope).run({
    input: {
      scope: restaurant_id
        ? { type: "restaurant", restaurant_id }
        : { type: "platform" },
      now: new Date().toISOString(),
    },
  })
  res.json(result)
}
