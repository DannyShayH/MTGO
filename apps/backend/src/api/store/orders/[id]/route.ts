import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"

/** Return the Order with the fields the request's query config selected. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await getOrderDetailWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      fields: req.queryConfig.fields,
      filters: { is_draft_order: false },
    },
  })
  res.status(200).json({ order: result })
}
