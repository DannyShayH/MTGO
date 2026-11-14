import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"

export type CustomerAuthContext = {
  actor_type?: string
  actor_id?: string
  auth_identity_id: string
  auth_provider?: string
}

export const requireVerifiedCustomerStep = createStep(
  "require-verified-customer",
  async (context: CustomerAuthContext, { container }) => {
    if (
      context.actor_type !== "customer" ||
      context.auth_provider !== "customer-emailpass" ||
      !context.actor_id
    ) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "customer_email_verification_required",
      )
    }

    const auth = container.resolve(Modules.AUTH)
    const identity = await auth.retrieveAuthIdentity(context.auth_identity_id, {
      relations: ["provider_identities"],
    })
    const providerIdentity = identity.provider_identities?.find(
      (provider) => provider.provider === "customer-emailpass",
    )
    const verification = providerIdentity
      ? await auth.listAuthVerifications({
          auth_identity_id: identity.id,
          entity_id: providerIdentity.entity_id,
          entity_type: "email",
        })
      : []

    if (!verification[0]?.verified_at) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "customer_email_verification_required",
      )
    }

    return new StepResponse(true)
  },
)
