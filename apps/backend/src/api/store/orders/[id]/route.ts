import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readOrderDetail } from "../../../../workflows/orders/order-read"

/** Return the Order with the fields the request's query config selected. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const order = await readOrderDetail(req.scope, {
    order_id: req.params.id,
    fields: req.queryConfig.fields,
  })
  res.status(200).json({ order })
}
