import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { searchPostalCodesStep } from "./steps/search-postal-codes"
import { syncPostalCodeRegisterStep } from "./steps/sync-postal-code-register"
import { RegisteredPostalCode } from "./types"

export const searchPostalCodesWorkflow = createWorkflow(
  "search-postal-codes",
  function (input: { q?: string }) {
    return new WorkflowResponse({ postal_codes: searchPostalCodesStep(input) })
  },
)
export const syncPostalCodeRegisterWorkflow = createWorkflow(
  "sync-postal-code-register",
  function (input: { postal_codes: RegisteredPostalCode[] }) {
    return new WorkflowResponse(syncPostalCodeRegisterStep(input))
  },
)
