import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reviewBasketWorkflow } from "../../../../../workflows/carts/review-basket"

/**
 * What completion would refuse in the Customer's basket, without refusing:
 * each issue names the dish or rule and, for a changed dish, its current
 * revision and price to review again.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await reviewBasketWorkflow(req.scope).run({
    input: { cart_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  res.json(result)
}
