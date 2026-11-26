import type { MedusaContainer } from "@medusajs/framework/types"
import type { IFlagRouter } from "@medusajs/framework/feature-flags"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { retrieveOrderFeedbackWorkflow } from "./index"
import { logRecoveryFailure } from "../order-operations/recovery-log"

/** Feedback eligibility is separate from a recorded invitation. */
export async function readFeedbackEligibility(
  container: MedusaContainer,
  orderId: string,
) {
  const unavailable = {
    status: "unavailable",
    can_submit: false,
    closes_at: null,
  }
  if (
    !container
      .resolve<IFlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
      .isFeatureEnabled("feedback")
  )
    return unavailable
  try {
    const { result } = await retrieveOrderFeedbackWorkflow(container).run({
      input: { order_id: orderId },
    })
    return {
      status: result.can_submit ? "available" : "settled",
      can_submit: result.can_submit,
      closes_at: result.closes_at,
    }
  } catch (error) {
    logRecoveryFailure(container, orderId, error)
    return unavailable
  }
}
