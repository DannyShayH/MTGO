import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import { validateReviewedCheckoutWorkflow } from "../workflows/carts/validate-reviewed-checkout"

export async function requireReviewedCheckout(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  await validateReviewedCheckoutWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
      customer_id: req.auth_context.actor_id,
    },
  })

  next()
}
