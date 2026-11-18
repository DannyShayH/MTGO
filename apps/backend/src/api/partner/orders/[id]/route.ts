import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { retrievePartnerOrderWorkflow } from "../../../../workflows/order-operations"

/** One of the staff member's Restaurant's Orders; any other id is not found. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await retrievePartnerOrderWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id, order_id: req.params.id },
  })
  res.json(result)
}
