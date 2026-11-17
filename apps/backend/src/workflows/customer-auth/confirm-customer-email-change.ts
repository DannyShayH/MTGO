import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"
import {
  getCustomerLanguage,
  type CustomerEmailChange,
  type CustomerEmailChangeNotice,
} from "./email-change-utils"

const confirmCustomerEmailChangeStep = createStep(
  "confirm-customer-email-change",
  async ({ code }: { code: string }, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const verification = await auth.confirmAuthVerification({
      code,
      code_provider: "token",
    })
    if (verification.entity_type !== "customer-email-change") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "customer_email_change_link_invalid",
      )
    }

    const pending = verification.metadata as CustomerEmailChange | null
    if (!pending?.customer_id || !pending.old_email || !pending.new_email) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "customer_email_change_link_invalid",
      )
    }
    const identity = await auth.retrieveAuthIdentity(
      verification.auth_identity_id,
      {
        relations: ["provider_identities"],
      },
    )
    const provider = identity.provider_identities?.find(
      (entry) => entry.provider === "customer-emailpass",
    )
    const currentPending =
      provider?.user_metadata?.pending_customer_email_change
    if (
      !provider ||
      identity.app_metadata?.customer_id !== pending.customer_id ||
      provider.entity_id !== pending.old_email ||
      JSON.stringify(currentPending) !== JSON.stringify(pending)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "customer_email_change_link_superseded",
      )
    }

    const [existing] = await auth.listProviderIdentities({
      provider: "customer-emailpass",
      entity_id: pending.new_email,
    })
    if (existing && existing.auth_identity_id !== identity.id) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "customer_email_unavailable",
      )
    }

    const emailVerification = await auth.requestAuthVerification({
      auth_identity_id: identity.id,
      entity_id: pending.new_email,
      entity_type: "email",
      code_provider: "token",
    })
    if (!emailVerification.code) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "customer_email_change_verification_failed",
      )
    }
    await auth.confirmAuthVerification({
      code: emailVerification.code,
      code_provider: "token",
    })

    const oldUserMetadata = { ...(provider.user_metadata ?? {}) }
    delete oldUserMetadata.pending_customer_email_change
    const customer = await container
      .resolve(Modules.CUSTOMER)
      .retrieveCustomer(pending.customer_id)
    const language = getCustomerLanguage(customer.metadata)
    const securityVersion = randomUUID()
    const previousCustomerMetadata = { ...(customer.metadata ?? {}) }
    const previousIdentityMetadata = { ...(identity.app_metadata ?? {}) }
    const previousProviderEntityId = provider.entity_id
    await auth.updateProviderIdentities({
      id: provider.id,
      entity_id: pending.new_email,
      user_metadata: {
        ...oldUserMetadata,
        customer_id: pending.customer_id,
        security_version: securityVersion,
      },
    })
    try {
      await container
        .resolve(Modules.CUSTOMER)
        .updateCustomers(pending.customer_id, {
          email: pending.new_email,
          metadata: {
            ...(customer.metadata ?? {}),
            customer_security_version: securityVersion,
          },
        })
      await auth.updateAuthIdentities({
        id: identity.id,
        app_metadata: {
          ...identity.app_metadata,
          customer_id: pending.customer_id,
          security_version: securityVersion,
        },
      })
    } catch (error) {
      await auth.updateProviderIdentities({
        id: provider.id,
        entity_id: pending.old_email,
        user_metadata: oldUserMetadata,
      })
      throw error
    }

    let oldEmailNotice = "sent"
    try {
      if (process.env.TEST_MAILBOX_FAIL_RECIPIENT === pending.old_email)
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "customer_old_email_notice_delivery_failed",
        )
      await container.resolve(Modules.NOTIFICATION).createNotifications({
        to: pending.old_email,
        channel: "email",
        template: "customer-email-change-completed",
        trigger_type: "customer.email_change_completed",
        resource_id: identity.id,
        data: { new_email: pending.new_email, language },
        idempotency_key: `customer-email-change-completed:${identity.id}:${pending.new_email}`,
      })
    } catch {
      oldEmailNotice = "failed"
      await container
        .resolve(Modules.CUSTOMER)
        .updateCustomers(pending.customer_id, {
          metadata: {
            ...(customer.metadata ?? {}),
            pending_customer_email_change_notice: {
              old_email: pending.old_email,
              new_email: pending.new_email,
              language,
            } satisfies CustomerEmailChangeNotice,
          },
        })
    }

    return new StepResponse(
      { email: pending.new_email, old_email_notice: oldEmailNotice },
      {
        providerId: provider.id,
        previousProviderEntityId,
        previousProviderMetadata: oldUserMetadata,
        customerId: pending.customer_id,
        previousCustomerMetadata,
        identityId: identity.id,
        previousIdentityMetadata,
      },
    )
  },
  async (compensation, { container }) => {
    if (!compensation) return
    const auth = container.resolve(Modules.AUTH)
    await auth.updateProviderIdentities({
      id: compensation.providerId,
      entity_id: compensation.previousProviderEntityId,
      user_metadata: compensation.previousProviderMetadata,
    })
    await container
      .resolve(Modules.CUSTOMER)
      .updateCustomers(compensation.customerId, {
        metadata: compensation.previousCustomerMetadata,
      })
    await auth.updateAuthIdentities({
      id: compensation.identityId,
      app_metadata: compensation.previousIdentityMetadata,
    })
  },
)

export const confirmCustomerEmailChangeWorkflow = createWorkflow(
  "confirm-customer-email-change",
  function (input: { code: string }) {
    return new WorkflowResponse(confirmCustomerEmailChangeStep(input))
  },
)
