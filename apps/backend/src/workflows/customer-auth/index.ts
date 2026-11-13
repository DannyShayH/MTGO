import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { isolateCustomerIdentityStep } from "./steps/isolate-customer-identity"

export const isolateCustomerIdentityWorkflow = createWorkflow(
  "isolate-customer-identity",
  function (input: { auth_identity_id: string }) {
    return new WorkflowResponse(
      isolateCustomerIdentityStep(input.auth_identity_id),
    )
  },
)
