import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listPartnerOrdersWorkflow } from "../../../workflows/order-operations"
import { GetPartnerOrdersQuery } from "../validators"

/** The signed-in staff member's Restaurant queue, one view and page at a time. */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetPartnerOrdersQuery>,
  res: MedusaResponse,
) {
  const { view, limit, offset } = req.validatedQuery as GetPartnerOrdersQuery
  const { result } = await listPartnerOrdersWorkflow(req.scope).run({
    input: { staff_id: req.auth_context.actor_id, view, limit, offset },
  })
  res.json(result)
}
