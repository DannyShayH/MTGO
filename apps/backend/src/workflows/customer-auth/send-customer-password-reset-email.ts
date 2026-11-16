import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"

type ResetEvent = { actor_type: string; entity_id: string; token: string }

const sendCustomerPasswordResetEmailStep = createStep(
  "send-customer-password-reset-email",
  async (input: ResetEvent, { container }) => {
    if (input.actor_type !== "customer") return new StepResponse(false)
    const auth = container.resolve(Modules.AUTH)
    const [provider] = await auth.listProviderIdentities({
      provider: "customer-emailpass",
      entity_id: input.entity_id,
    })
    if (!provider?.auth_identity_id) return new StepResponse(false)
    const identity = await auth.retrieveAuthIdentity(provider.auth_identity_id)
    const customerId = identity.app_metadata?.customer_id
    if (typeof customerId !== "string") return new StepResponse(false)
    const customer = await container
      .resolve(Modules.CUSTOMER)
      .retrieveCustomer(customerId)
    const language =
      customer.metadata?.preferred_language === "en" ? "en" : "da"
    const base =
      process.env.STOREFRONT_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:8000"
    const params = new URLSearchParams({ token: input.token, language })
    if (process.env.TEST_MAILBOX_FAIL_RECIPIENT === input.entity_id)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "customer_reset_delivery_failed",
      )
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: input.entity_id,
      channel: "email",
      template: "customer-password-reset",
      resource_id: identity.id,
      data: { reset_url: `${base}/dk/reset-password#${params}`, language },
    })
    return new StepResponse(true)
  },
)

export const sendCustomerPasswordResetEmailWorkflow = createWorkflow(
  "send-customer-password-reset-email",
  function (input: ResetEvent) {
    return new WorkflowResponse(sendCustomerPasswordResetEmailStep(input))
  },
)
