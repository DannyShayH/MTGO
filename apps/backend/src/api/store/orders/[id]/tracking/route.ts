import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrieveOrderTrackingWorkflow } from "../../../../../workflows/order-operations"

/** The owning Customer's recorded Order language and food progress. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrieveOrderTrackingWorkflow(req.scope).run({
    input: { order_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
