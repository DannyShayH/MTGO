import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"

/** Retryable data migration: copy credentials, then detach only the Customer link. */
export const isolateCustomerIdentityStep = createStep(
  "isolate-customer-identity",
  async (id: string, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const legacy = await auth.retrieveAuthIdentity(id, {
      relations: ["provider_identities"],
    })
    const customerId = legacy.app_metadata?.customer_id
    if (!customerId) return new StepResponse(undefined)
    const provider = legacy.provider_identities?.find(
      (identity) => identity.provider === "emailpass",
    )
    if (!provider)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "customer_migration_provider_missing",
      )
    const email = provider.entity_id.trim().toLowerCase()
    const [existing] = await auth.listProviderIdentities({
      provider: "customer-emailpass",
      entity_id: email,
    })
    let isolatedId = existing?.auth_identity_id
    if (isolatedId) {
      const isolated = await auth.retrieveAuthIdentity(isolatedId)
      if (isolated.app_metadata?.customer_id !== customerId) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "customer_migration_identity_conflict",
        )
      }
    } else {
      const isolated = await auth.createAuthIdentities({
        app_metadata: { customer_id: customerId },
        provider_identities: [
          {
            provider: "customer-emailpass",
            entity_id: email,
            // Copy the hash, never a plaintext password or other-role verification state.
            provider_metadata: {
              password: provider.provider_metadata?.password,
            },
          },
        ],
      })
      isolatedId = isolated.id
    }
    await auth.updateAuthIdentities({
      id,
      app_metadata: { ...legacy.app_metadata, customer_id: null },
    })
    return new StepResponse(isolatedId)
  },
)
