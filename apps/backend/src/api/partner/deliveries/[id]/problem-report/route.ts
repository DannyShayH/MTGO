import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { reportDeliveryProblemWorkflow } from "../../../../../workflows/delivery/problem-report"
import type { PostProblemReportBody } from "../../../validators"

/**
 * @openapi
 * /partner/deliveries/{id}/problem-report:
 *   post:
 *     summary: Report a problem with the responsible agent's active Delivery
 *     security:
 *       - deliveryAgentBearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category: { type: string, enum: [restaurant_unavailable, food_missing_or_wrong, address_not_found, other] }
 *               note: { type: string, maxLength: 280 }
 *     responses:
 *       '201': { description: First report raised }
 *       '200': { description: Already reported; returns the first report }
 *       '400': { description: Invalid body or inactive Delivery }
 *       '403': { description: Different or revoked agent }
 *       '404': { description: Delivery not found }
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostProblemReportBody>,
  res: MedusaResponse,
) {
  const { result } = await reportDeliveryProblemWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      agent_id: req.auth_context.actor_id,
      ...req.validatedBody,
    },
  })
  res.status(result.status === "reported" ? 201 : 200).json(result)
}
