import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  getCustomerLanguage,
  type CustomerEmailChange,
} from "./email-change-utils"

export type RequestCustomerEmailChangeInput = {
  auth_identity_id: string
  customer_id: string
  current_password: string
  new_email: string
}

const requestCustomerEmailChangeStep = createStep(
  "request-customer-email-change",
  async (input: RequestCustomerEmailChangeInput, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const identity = await auth.retrieveAuthIdentity(input.auth_identity_id, {
      relations: ["provider_identities"],
    })
    const provider = identity.provider_identities?.find(
      (entry) => entry.provider === "customer-emailpass",
    )
    if (!provider || identity.app_metadata?.customer_id !== input.customer_id) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "customer_sign_in_required",
      )
    }

    const currentEmail = provider.entity_id.trim().toLowerCase()
    const newEmail = input.new_email.trim().toLowerCase()
    const authentication = await auth.authenticate("customer-emailpass", {
      body: { email: currentEmail, password: input.current_password },
    })
    if (
      !authentication.success ||
      authentication.authIdentity?.id !== identity.id
    ) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "customer_current_password_invalid",
      )
    }
    if (newEmail === currentEmail) {
      throw new MedusaError(MedusaError.Types.CONFLICT, "customer_email_same")
    }

    const [existing] = await auth.listProviderIdentities({
      provider: "customer-emailpass",
      entity_id: newEmail,
    })
    if (existing && existing.auth_identity_id !== identity.id) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "customer_email_unavailable",
      )
    }

    const customer = await container
      .resolve(Modules.CUSTOMER)
      .retrieveCustomer(input.customer_id)
    const language = getCustomerLanguage(customer.metadata)
    const pending: CustomerEmailChange = {
      customer_id: input.customer_id,
      old_email: currentEmail,
      new_email: newEmail,
    }
    const previousMetadata = { ...(provider.user_metadata ?? {}) }
    await auth.updateProviderIdentities({
      id: provider.id,
      user_metadata: {
        ...(provider.user_metadata ?? {}),
        pending_customer_email_change: pending,
      },
    })

    const verification = await auth.requestAuthVerification({
      auth_identity_id: identity.id,
      entity_id: newEmail,
      entity_type: "customer-email-change",
      code_provider: "token",
      metadata: pending,
    })
    if (!verification.code || !verification.expires_at) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "customer_email_change_generation_failed",
      )
    }

    const base =
      process.env.STOREFRONT_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:8000"
    if (process.env.TEST_MAILBOX_FAIL_RECIPIENT === newEmail) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "customer_email_change_delivery_failed",
      )
    }
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: newEmail,
      channel: "email",
      template: "customer-email-change",
      trigger_type: "customer.email_change_requested",
      resource_id: identity.id,
      data: {
        confirmation_url: `${base}/dk/change-email?token=${encodeURIComponent(verification.code)}&language=${language}`,
        expires_at: new Date(verification.expires_at).toISOString(),
        language,
      },
      idempotency_key: `customer-email-change:${identity.id}:${verification.code}`,
    })

    return new StepResponse(
      { email: newEmail, expires_at: verification.expires_at },
      { providerId: provider.id, previousMetadata },
    )
  },
  async (compensation, { container }) => {
    if (!compensation) return
    await container.resolve(Modules.AUTH).updateProviderIdentities({
      id: compensation.providerId,
      user_metadata: compensation.previousMetadata,
    })
  },
)

export const requestCustomerEmailChangeWorkflow = createWorkflow(
  "request-customer-email-change",
  function (input: RequestCustomerEmailChangeInput) {
    return new WorkflowResponse(requestCustomerEmailChangeStep(input))
  },
)
