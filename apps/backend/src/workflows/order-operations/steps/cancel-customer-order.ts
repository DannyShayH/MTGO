import { createStep } from "@medusajs/framework/workflows-sdk"
import { commitPreAcceptanceCancellation } from "../cancellation"
import { readOrderProgress } from "./read-order-progress"
import { cancellationStepResponse } from "./cancellation-response"

/**
 * The owning Customer's guarded cancellation (#145), run under the Order's
 * lock through the shared engine, the same as staff rejection: before the
 * deadline the Order is recorded as the Customer's cancellation, at or after
 * it the Order receives the timeout outcome instead, even if the sweep has
 * not run yet. After acceptance it is refused and left to an operator, with
 * the current progress. A recorded cancellation is the current outcome for a
 * repeat. Deliberately no compensation: a committed cancellation is
 * authoritative and may never be undone (see `cancellation.ts`).
 */
export const cancelCustomerOrderStep = createStep(
  "cancel-customer-order",
  async (input: { order_id: string; customer_id: string }, { container }) =>
    cancellationStepResponse(
      await commitPreAcceptanceCancellation(container, {
        order_id: input.order_id,
        requested: "customer_cancelled",
        actor: input.customer_id,
        note: null,
        now: new Date(),
      }),
      () => readOrderProgress(container, input.order_id),
    ),
)
