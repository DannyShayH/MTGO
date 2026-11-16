import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { listVisibleOrders } from "../../../workflows/orders/list-visible-orders"

/** Keep authorization and query validation from Medusa's Admin middleware. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const result = await listVisibleOrders(req.scope, {
    fields: req.queryConfig.fields,
    filters: req.filterableFields,
    pagination: req.queryConfig.pagination,
  })
  res.json(result)
}
