import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveOrderProgressWorkflow } from "../../../../../workflows/order-operations"

/** The owning Customer's food progress, cancellation and refund outcome. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveOrderProgressWorkflow(req.scope).run({
    input: { order_id: req.params.id },
  })
  res.json(result)
}
