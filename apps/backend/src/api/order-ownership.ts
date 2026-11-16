import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { validateOrderOwnershipWorkflow } from "../workflows/orders/validate-order-ownership"

export async function requireOwnedOrder(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  await validateOrderOwnershipWorkflow(req.scope).run({
    input: { order_id: req.params.id, customer_id: req.auth_context.actor_id },
  })
  next()
}

export function disableOrderTransfer(
  _req: MedusaRequest,
  _res: MedusaResponse,
  _next: MedusaNextFunction,
) {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "order_transfer_disabled",
  )
}
