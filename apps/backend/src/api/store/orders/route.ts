import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listVisibleOrders } from "../../../workflows/orders/list-visible-orders"

/** Hide core completion's provisional Order until payment capture and Restaurant linking finish. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const result = await listVisibleOrders(req.scope, {
    fields: req.queryConfig.fields,
    filters: {
      ...req.filterableFields,
      customer_id: req.auth_context.actor_id,
    },
    pagination: req.queryConfig.pagination,
  })
  res.json(result)
}
