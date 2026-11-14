import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { requestVerificationStep } from "@medusajs/medusa/core-flows"
import { sendCustomerVerificationEmailStep } from "./steps/send-customer-verification-email"

export type RequestCustomerVerificationEmailInput = {
  auth_identity_id: string
  entity_id: string
  metadata?: Record<string, unknown>
}

export const requestCustomerVerificationEmailWorkflow = createWorkflow(
  "request-customer-verification-email",
  function (input: RequestCustomerVerificationEmailInput) {
    const verificationInput = transform({ input }, ({ input }) => ({
      auth_identity_id: input.auth_identity_id,
      entity_id: input.entity_id,
      entity_type: "email",
      code_provider: "token",
      metadata: input.metadata,
    }))
    const verification = requestVerificationStep(verificationInput)
    const emailInput = transform({ verification }, ({ verification }) => ({
      auth_identity_id: verification.auth_identity_id,
      entity_id: verification.entity_id,
      code: verification.code,
      expires_at: verification.expires_at,
      metadata: verification.metadata ?? {},
    }))

    return new WorkflowResponse(sendCustomerVerificationEmailStep(emailInput))
  },
)
