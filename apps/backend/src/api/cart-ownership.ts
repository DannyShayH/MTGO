import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import { validateCartOwnershipWorkflow } from "../workflows/carts/validate-cart-ownership"

/**
 * Prevents an expired or different Customer session from using a private cart
 * ID that remains in the browser while leaving anonymous carts public.
 */
export async function requireOwnedCart(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!req.params.id) {
    next()
    return
  }

  await validateCartOwnershipWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
      actor_type: req.auth_context?.actor_type,
      actor_id: req.auth_context?.actor_id,
      require_customer_ownership: false,
    },
  })

  next()
}

export async function requireCustomerOwnedCart(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  await validateCartOwnershipWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
      actor_type: req.auth_context?.actor_type,
      actor_id: req.auth_context?.actor_id,
      require_customer_ownership: true,
    },
  })

  next()
}
