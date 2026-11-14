import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { requireVerifiedCustomerWorkflow } from "../workflows/customer-auth/require-verified-customer"

/** Reject legacy Customer sessions after the identity split, including refreshes. */
export async function requireIsolatedCustomerIdentity(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!(await hasIsolatedCustomerIdentity(req)))
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "customer_sign_in_required",
    )
  next()
}

/** Checkout may only be completed by a Customer whose email verification is current. */
export async function requireVerifiedCustomer(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  await requireVerifiedCustomerWorkflow(req.scope).run({
    input: req.auth_context,
  })
  next()
}

/** Public Store operations remain available when a legacy Customer must sign in again. */
export async function discardLegacyCustomerIdentity(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!(await hasIsolatedCustomerIdentity(req))) {
    // Clear all authentication sources before route-specific authentication runs.
    Reflect.deleteProperty(req, "auth_context")
    delete req.headers.authorization
    if (req.session) delete req.session.auth_context
  }
  next()
}

async function hasIsolatedCustomerIdentity(req: AuthenticatedMedusaRequest) {
  const context = req.auth_context
  if (context?.actor_type !== "customer") return true
  if (context.auth_provider !== "customer-emailpass") return false
  const auth = req.scope.resolve(Modules.AUTH)
  const identity = await auth
    .retrieveAuthIdentity(context.auth_identity_id, {
      relations: ["provider_identities"],
    })
    .catch((error: unknown) => {
      if (
        error instanceof MedusaError &&
        error.type === MedusaError.Types.NOT_FOUND
      )
        return null
      throw error
    })
  return Boolean(
    identity?.provider_identities?.some(
      (provider) => provider.provider === "customer-emailpass",
    ) &&
    (!context.actor_id ||
      identity?.app_metadata?.customer_id === context.actor_id),
  )
}

/** Unknown actor types must not be able to mint other-role tokens with Customer credentials. */
export function restrictCustomerProvider(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (
    req.params.auth_provider === "customer-emailpass" &&
    req.params.actor_type !== "customer"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "customer_provider_not_allowed",
    )
  }
  next()
}
