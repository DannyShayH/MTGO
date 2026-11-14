import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { sendCustomerVerificationEmailStep } from "./steps/send-customer-verification-email"
import type { VerificationRequested } from "./types"

export const sendCustomerVerificationEmailWorkflow = createWorkflow(
  "send-customer-verification-email",
  function (input: VerificationRequested) {
    return new WorkflowResponse(sendCustomerVerificationEmailStep(input))
  },
)
