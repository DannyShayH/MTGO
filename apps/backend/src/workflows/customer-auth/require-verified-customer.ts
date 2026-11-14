import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  CustomerAuthContext,
  requireVerifiedCustomerStep,
} from "./steps/require-verified-customer"

export const requireVerifiedCustomerWorkflow = createWorkflow(
  "require-verified-customer",
  function (input: CustomerAuthContext) {
    return new WorkflowResponse(requireVerifiedCustomerStep(input))
  },
)
