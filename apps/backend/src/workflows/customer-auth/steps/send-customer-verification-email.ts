import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { VerificationRequested } from "../types"

export const sendCustomerVerificationEmailStep = createStep(
  "send-customer-verification-email",
  async (data: VerificationRequested, { container }) => {
    if (!data.code || !data.expires_at)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "customer_verification_generation_failed",
      )

    const locale = data.metadata?.preferred_language === "en" ? "en" : "da"
    const returnTo =
      typeof data.metadata?.return_to === "string" &&
      data.metadata.return_to.startsWith("/") &&
      !data.metadata.return_to.startsWith("//")
        ? data.metadata.return_to
        : undefined
    const storefrontUrl =
      process.env.STOREFRONT_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:8000"
    const verificationParams = new URLSearchParams({
      token: data.code,
      language: locale,
    })
    if (returnTo) verificationParams.set("return_to", returnTo)
    const verificationUrl = `${storefrontUrl}/dk/verify-account?${verificationParams.toString()}`

    if (
      process.env.TEST_MAILBOX_FAIL_RECIPIENT &&
      process.env.TEST_MAILBOX_FAIL_RECIPIENT === data.entity_id
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "customer_verification_delivery_failed",
      )
    }

    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "customer-verification",
      trigger_type: "auth.verification_requested",
      resource_id: data.auth_identity_id,
      data: {
        verification_url: verificationUrl,
        expires_at: new Date(data.expires_at).toISOString(),
        language: locale,
      },
      idempotency_key: `customer-verification:${data.auth_identity_id}:${data.code}`,
    })

    return new StepResponse(true)
  },
)
