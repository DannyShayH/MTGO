import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { orderOperationsOf } from "../purchased-items"

/**
 * Placement has copied the frozen review onto the Order's record, so the
 * cart's review is no longer needed. Only reviews of paid Orders still
 * awaiting placement remain; a failed completion already removed its own.
 */
export const consumePurchaseReviewStep = createStep(
  "consume-purchase-review",
  async (input: { id: string | null }, { container }) => {
    if (!input.id) return new StepResponse(undefined, null)
    await orderOperationsOf(container).softDeletePurchaseReviews(input.id)
    return new StepResponse(undefined, input.id)
  },
  async (id, { container }) => {
    if (!id) return
    await orderOperationsOf(container).restorePurchaseReviews(id)
  },
)
