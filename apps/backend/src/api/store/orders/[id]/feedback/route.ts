import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  retrieveOrderFeedbackWorkflow,
  submitFeedbackWorkflow,
} from "../../../../../workflows/feedback"
import type { PostStoreOrderFeedbackBody } from "../../validators"

/**
 * @openapi
 * /store/orders/{id}/feedback:
 *   get:
 *     summary: The owning Customer's Feedback on an Order
 *     description: Behind the `feedback` Feature flag; `404` while it is off.
 *     security:
 *       - customerBearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200': { description: "The recorded ratings or null, can_submit, and closes_at (168 hours after handover while open, else null)" }
 *       '401': { description: Not signed in as a Customer }
 *       '404': { description: Flag off, unknown Order or another Customer's Order }
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveOrderFeedbackWorkflow(req.scope).run({
    input: { order_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}

/**
 * @openapi
 * /store/orders/{id}/feedback:
 *   post:
 *     summary: Rate a delivered Order once
 *     description: Behind the `feedback` Feature flag; `404` while it is off.
 *     security:
 *       - customerBearer: []
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
 *             required: [food_rating, experience_rating, agent_rating]
 *             additionalProperties: false
 *             properties:
 *               food_rating: { type: integer, minimum: 1, maximum: 5 }
 *               experience_rating: { type: integer, minimum: 1, maximum: 5 }
 *               agent_rating: { type: integer, minimum: 1, maximum: 5 }
 *     responses:
 *       '201': { description: Recorded; the same body as the read }
 *       '400': { description: "`feedback_ratings_invalid`, `order_not_delivered` or `feedback_window_closed` (168 hours or more after handover)" }
 *       '401': { description: Not signed in as a Customer }
 *       '404': { description: Flag off, unknown Order or another Customer's Order }
 *       '409': { description: "`feedback_already_submitted` with the recorded `feedback`" }
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostStoreOrderFeedbackBody>,
  res: MedusaResponse,
) {
  const { result } = await submitFeedbackWorkflow(req.scope).run({
    input: {
      ratings: req.validatedBody,
      order_id: req.params.id,
      customer_id: req.auth_context.actor_id,
    },
  })
  res.status(201).json(result)
}
