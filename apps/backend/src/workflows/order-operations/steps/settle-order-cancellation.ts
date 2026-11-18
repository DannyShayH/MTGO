import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  attemptFullRefund,
  logCancellationUpstreamFailure,
} from "../full-refund"
import { syncNativeOrderCancellationWorkflow } from "../native-cancellation"

/**
 * Carries out a committed cancellation's effects (#143): first the full
 * refund attempt, then native Medusa cancellation, in the same order as
 * Medusa's own `cancelOrderWorkflow`, since recording a refund recomputes the
 * payment collection's status. Neither result can undo the cancellation:
 * this step never throws, a refund outcome is recorded on its obligation and
 * an interrupted native synchronization stays repairable from the record
 * (`native_cancelled_at` unset). Both are idempotent, so a repeat or the
 * later recovery runner can call this again.
 */
export const settleOrderCancellationStep = createStep(
  "settle-order-cancellation",
  async (input: { order_id: string; created_by: string }, { container }) => {
    const refund = await attemptFullRefund(container, input).catch(() => {
      logCancellationUpstreamFailure(container, input.order_id)
      return "pending" as const
    })
    let nativeCancellation: "synchronized" | "pending" = "synchronized"
    try {
      await syncNativeOrderCancellationWorkflow(container).run({
        input: { order_id: input.order_id },
      })
    } catch {
      nativeCancellation = "pending"
      logCancellationUpstreamFailure(container, input.order_id)
    }
    return new StepResponse({ refund, native_cancellation: nativeCancellation })
  },
)
