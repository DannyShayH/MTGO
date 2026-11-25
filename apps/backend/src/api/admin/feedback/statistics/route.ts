import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { feedbackStatisticsWorkflow } from "../../../../workflows/feedback/statistics"

/**
 * @oas [get] /admin/feedback/statistics
 * operationId: GetAdminFeedbackStatistics
 * summary: Get Feedback statistics for the last 30 days
 * description: Returns separate food, agent and overall experience ratings and delivered Order counts for operators.
 * x-authenticated: true
 * responses:
 *   "200":
 *     description: Feedback statistics
 *   "404":
 *     description: Feedback is not released
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await feedbackStatisticsWorkflow(req.scope).run({
    input: {},
  })
  res.json(result)
}
