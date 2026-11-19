import { createStep } from "@medusajs/framework/workflows-sdk"
import { commitPreAcceptanceCancellation } from "../cancellation"
import { readRestaurantOrder } from "./read-restaurant-orders"
import { cancellationStepResponse } from "./cancellation-response"

type Input = {
  restaurant_id: string
  order_id: string
  staff_id: string
  note: string | null
}

/**
 * Staff rejection's guarded transition (#143), run under the Order's lock,
 * through the shared cancellation engine: before the deadline the Order is
 * rejected, at or after it the Order receives the timeout outcome instead. A
 * recorded cancellation is the current outcome for a repeat. Deliberately no
 * compensation: a committed cancellation is authoritative (see
 * `cancellation.ts`).
 */
export const cancelRestaurantOrderStep = createStep(
  "cancel-restaurant-order",
  async (input: Input, { container }) =>
    cancellationStepResponse(
      await commitPreAcceptanceCancellation(container, {
        order_id: input.order_id,
        restaurant_id: input.restaurant_id,
        requested: "restaurant_rejected",
        actor: input.staff_id,
        note: input.note,
        now: new Date(),
      }),
      () => readRestaurantOrder(container, input),
    ),
)
