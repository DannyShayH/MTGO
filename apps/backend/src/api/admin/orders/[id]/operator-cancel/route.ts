import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  cancelAcceptedOrderWorkflow,
  previewOperatorCancellationWorkflow,
} from "../../../../../workflows/order-operations"
import type { PostAdminOperatorCancelBody } from "../../validators"

/** The Full refund the confirmation shows before cancelling (#199). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await previewOperatorCancellationWorkflow(req.scope).run({
    input: { order_id: req.params.id },
  })
  res.json({ preview: result })
}

/**
 * An operator cancels an accepted, unfinished Order with a full refund
 * (#199). Documented in `src/api/README.md`.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminOperatorCancelBody>,
  res: MedusaResponse,
) {
  const { result } = await cancelAcceptedOrderWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      operator_id: req.auth_context.actor_id,
      reason: req.validatedBody.reason,
    },
  })
  res.json({ cancellation: result })
}
