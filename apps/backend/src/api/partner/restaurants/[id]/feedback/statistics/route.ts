import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveRestaurantFeedbackStatisticsWorkflow } from "../../../../../../workflows/feedback/statistics"
import type { GetFeedbackStatisticsQuery } from "../../../../../admin/feedback/statistics/validators"

/**
 * @oas [get] /partner/restaurants/{id}/feedback/statistics
 * operationId: GetPartnerRestaurantFeedbackStatistics
 * summary: Get the own Restaurant's food rating for a period
 * description: Returns the signed-in staff member's own Restaurant's food rating (average to one decimal or null, count, 1-5 distribution) and delivered Order count, grouped by handover time. Never agent or experience ratings, agents or Customers.
 * x-authenticated: true
 * parameters:
 *   - name: id
 *     in: path
 *     required: true
 *     schema:
 *       type: string
 *     description: The staff member's own Restaurant.
 *   - name: period
 *     in: query
 *     required: false
 *     schema:
 *       type: string
 *       enum: [last_30_days, previous_month, all_time]
 *       default: last_30_days
 *     description: The rolling last 30 days, the previous Copenhagen calendar month, or all time.
 * responses:
 *   "200":
 *     description: The Restaurant's food rating
 *   "400":
 *     description: Unknown period
 *   "401":
 *     description: Not signed in as Restaurant staff
 *   "404":
 *     description: Feedback is not released, or another Restaurant
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetFeedbackStatisticsQuery>,
  res: MedusaResponse,
) {
  const { result } = await retrieveRestaurantFeedbackStatisticsWorkflow(
    req.scope,
  ).run({
    input: {
      staff_id: req.auth_context.actor_id,
      restaurant_id: req.params.id,
      period: req.validatedQuery.period,
    },
  })
  res.json(result)
}
