import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readRestaurantOperationsWorkflow } from "../../../../../workflows/operations-monitoring"

/**
 * @oas [get] /partner/restaurants/{id}/operations
 * operationId: GetPartnerRestaurantOperations
 * summary: Get the own Restaurant's operations figures
 * description: Returns, for the signed-in staff member's own Restaurant and with the same definitions operators see for it, the moment the figures were calculated for, the Open Orders as a total and by stage, the Orders placed in the last 24 hours with those now cancelled by category, placements in each of the 24 Copenhagen clock hours ending with the current one, placements on each of the previous seven complete Copenhagen days with their average, the average Order processing time for the Orders handed over in the last 24 hours with its exclusions and change from the previous seven days, the processing time per day over those seven days, and the Unfulfilled Order rate by cause with the Orders still open shown apart. Never Full refunds, attention items, unassigned deliveries, Delivery transit time or the Customer rating. Readable after the Restaurant is deactivated. Behind the operations_monitoring flag.
 * x-authenticated: true
 * parameters:
 *   - name: id
 *     in: path
 *     required: true
 *     schema:
 *       type: string
 *     description: The staff member's own Restaurant.
 * responses:
 *   "200":
 *     description: The Restaurant's operations figures
 *   "401":
 *     description: Not signed in as Restaurant staff
 *   "403":
 *     description: The staff member's access was revoked
 *   "404":
 *     description: Another Restaurant, or the operations_monitoring flag is off
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readRestaurantOperationsWorkflow(req.scope).run({
    input: {
      staff_id: req.auth_context.actor_id,
      restaurant_id: req.params.id,
      now: new Date().toISOString(),
    },
  })
  res.json(result)
}
