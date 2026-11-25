import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { feedbackStatisticsWorkflow } from "../../../../workflows/feedback/statistics"
import type { GetFeedbackStatisticsQuery } from "./validators"

/**
 * @oas [get] /admin/feedback/statistics
 * operationId: GetAdminFeedbackStatistics
 * summary: Get Feedback statistics for a period
 * description: Returns separate food, agent and overall experience ratings and delivered Order counts for operators, grouped by handover time, with the resolved period bounds.
 * x-authenticated: true
 * parameters:
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
 *     description: Feedback statistics
 *   "400":
 *     description: Unknown period
 *   "404":
 *     description: Feedback is not released
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { period } = req.validatedQuery as GetFeedbackStatisticsQuery
  const { result } = await feedbackStatisticsWorkflow(req.scope).run({
    input: { period },
  })
  res.json(result)
}
