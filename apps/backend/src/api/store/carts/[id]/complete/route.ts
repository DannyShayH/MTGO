import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { completeRestaurantCartWorkflow } from "../../../../../workflows/orders/complete-restaurant-cart"

/** Complete through Medusa, then return only an Order whose mock charge was captured and linked. */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await completeRestaurantCartWorkflow(req.scope).run({
    input: { cart_id: req.params.id },
  })
  res.json({ type: "order", order: result })
}
