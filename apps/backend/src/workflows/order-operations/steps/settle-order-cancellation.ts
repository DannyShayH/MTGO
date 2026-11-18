import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { settleCancellation } from "../cancellation"

/**
 * Carries out a committed cancellation's effects through the shared engine
 * (`settleCancellation`): the full refund attempt, then native Medusa
 * cancellation. It never throws, so neither can undo the cancellation.
 */
export const settleOrderCancellationStep = createStep(
  "settle-order-cancellation",
  async (input: { order_id: string }, { container }) =>
    new StepResponse(await settleCancellation(container, input.order_id)),
)
