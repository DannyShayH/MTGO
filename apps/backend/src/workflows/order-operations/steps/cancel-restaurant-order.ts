import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { withResponseFields } from "../../common/response-fields"
import { ORDER_CHANGED } from "../rules"
import { commitPreAcceptanceCancellation } from "../cancellation"
import { orderNotFound, readRestaurantOrder } from "./read-restaurant-orders"

type Input = {
  restaurant_id: string
  order_id: string
  staff_id: string
  note: string | null
}

/** Whether this request committed the cancellation. */
type CancellationResult = { cancelled: boolean }

async function refuseWithCurrent(
  container: MedusaContainer,
  input: Input,
  code: string,
) {
  const current = await readRestaurantOrder(container, input)
  const type =
    code === ORDER_CHANGED
      ? MedusaError.Types.CONFLICT
      : MedusaError.Types.NOT_ALLOWED
  return withResponseFields(new MedusaError(type, code, code), current)
}

/**
 * Staff rejection's guarded transition (#143), run under the Order's lock,
 * through the shared cancellation engine: before the deadline the Order is
 * rejected, at or after it the Order receives the timeout outcome instead. A
 * recorded cancellation is the current outcome for a repeat.
 */
export const cancelRestaurantOrderStep = createStep(
  "cancel-restaurant-order",
  async (input: Input, { container }) => {
    const result = await commitPreAcceptanceCancellation(container, {
      order_id: input.order_id,
      restaurant_id: input.restaurant_id,
      requested: "restaurant_rejected",
      actor: input.staff_id,
      note: input.note,
      now: new Date(),
    })
    switch (result.outcome) {
      case "not_found":
        throw orderNotFound()
      case "refused":
        throw await refuseWithCurrent(container, input, result.code)
      case "changed":
        throw await refuseWithCurrent(container, input, ORDER_CHANGED)
      case "already_cancelled":
        return new StepResponse<CancellationResult>({ cancelled: false })
      case "cancelled":
        return new StepResponse<CancellationResult>({ cancelled: true })
      default: {
        const unhandled: never = result
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `Unhandled cancellation outcome ${String(unhandled)}`,
        )
      }
    }
  },
)
