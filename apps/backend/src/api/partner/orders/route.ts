import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listPartnerOrdersWorkflow } from "../../../workflows/order-operations"
import { GetPartnerOrdersQuery } from "../validators"

/**
 * The signed-in staff member's Restaurant queue, one view and page at a time,
 * optionally narrowed by Order number, placement window and cancellation reason.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetPartnerOrdersQuery>,
  res: MedusaResponse,
) {
  const {
    view,
    limit,
    offset,
    q,
    placed_from,
    placed_to,
    cancellation_category,
  } = req.validatedQuery as GetPartnerOrdersQuery
  const { result } = await listPartnerOrdersWorkflow(req.scope).run({
    input: {
      staff_id: req.auth_context.actor_id,
      view,
      limit,
      offset,
      display_id: q,
      filters: { placed_from, placed_to, cancellation_category },
    },
  })
  res.json(result)
}
