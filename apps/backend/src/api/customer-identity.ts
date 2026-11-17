import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { requireVerifiedCustomerWorkflow } from "../workflows/customer-auth/require-verified-customer"

type CustomerProvider = {
  id: string
  provider: string
  entity_id: string
  auth_identity_id: string
  user_metadata?: Record<string, unknown>
}

type CustomerIdentity = {
  id: string
  app_metadata?: Record<string, unknown>
  provider_identities?: CustomerProvider[]
}

type CustomerAuthService = {
  retrieveAuthIdentity: (...args: unknown[]) => Promise<CustomerIdentity>
  listProviderIdentities?: (...args: unknown[]) => Promise<CustomerProvider[]>
}

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
  const isolated = await hasIsolatedCustomerIdentity(req)
  if (!isolated) {
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
  const auth = req.scope.resolve(Modules.AUTH) as CustomerAuthService
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
  const provider = await findCustomerProvider(req, auth, identity, context)
  const pendingCustomerId = (
    provider?.user_metadata?.pending_customer_email_change as
      { customer_id?: unknown } | undefined
  )?.customer_id
  const providerCustomerId =
    provider?.user_metadata?.customer_id ?? pendingCustomerId
  const tokenCustomerId =
    (
      context.user_metadata as
        | {
            customer_id?: unknown
            pending_customer_email_change?: { customer_id?: unknown }
          }
        | undefined
    )?.customer_id ??
    (
      context.user_metadata as
        | { pending_customer_email_change?: { customer_id?: unknown } }
        | undefined
    )?.pending_customer_email_change?.customer_id
  const contextAppMetadata = (
    context as unknown as { app_metadata?: Record<string, unknown> }
  ).app_metadata
  const contextSecurityVersion =
    context.user_metadata?.security_version ??
    contextAppMetadata?.security_version
  if (
    context &&
    !context.actor_id &&
    typeof (providerCustomerId ?? tokenCustomerId) === "string"
  ) {
    context.actor_id = (providerCustomerId ?? tokenCustomerId) as string
  }
  const identitySecurityVersion = identity?.app_metadata?.security_version
  const customerSecurityVersion = provider
    ? undefined
    : await findCustomerSecurityVersion(req, identity)
  const securityVersionMatches = provider
    ? provider.user_metadata?.security_version === contextSecurityVersion
    : (identitySecurityVersion ?? customerSecurityVersion) ===
      contextSecurityVersion
  const identityCustomerId =
    identity?.app_metadata?.customer_id ?? providerCustomerId
  return Boolean(
    securityVersionMatches &&
    (!context.actor_id || identityCustomerId === context.actor_id),
  )
}

async function findCustomerProvider(
  req: AuthenticatedMedusaRequest,
  auth: CustomerAuthService,
  identity: CustomerIdentity | null,
  context: AuthenticatedMedusaRequest["auth_context"],
) {
  const directProvider = identity?.provider_identities?.find(
    (entry) => entry.provider === "customer-emailpass",
  )
  if (directProvider || !auth.listProviderIdentities) return directProvider

  const listedProviders = await auth.listProviderIdentities({
    provider: "customer-emailpass",
  })
  const linkedProvider = listedProviders.find(
    (entry) => entry.auth_identity_id === context.auth_identity_id,
  )
  if (linkedProvider || !identity?.app_metadata?.customer_id)
    return linkedProvider

  try {
    const customer = await req.scope
      .resolve(Modules.CUSTOMER)
      .retrieveCustomer(identity.app_metadata.customer_id as string)
    const [provider] = await auth.listProviderIdentities({
      provider: "customer-emailpass",
      entity_id: customer.email,
    })
    return provider
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Could not resolve 'customer'")
    )
      return undefined
    throw error
  }
}

async function findCustomerSecurityVersion(
  req: AuthenticatedMedusaRequest,
  identity: CustomerIdentity | null,
) {
  if (!identity?.app_metadata?.customer_id) return undefined
  try {
    return (
      await req.scope
        .resolve(Modules.CUSTOMER)
        .retrieveCustomer(identity.app_metadata.customer_id as string)
    ).metadata?.customer_security_version
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Could not resolve 'customer'")
    )
      return undefined
    throw error
  }
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
