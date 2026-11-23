import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  cancelLegacyAwaitingOrder,
  findLegacyAwaitingOrders,
} from "../legacy-cancellation"
import { logRecoveryFailure } from "../recovery-log"

export type LegacyCancellationInput = {
  /** False lists what would be cancelled and changes nothing. */
  apply: boolean
  /** The server's processing time, as ISO text; defaults to now. */
  now?: string
}

export type LegacyCancellationResult = {
  /** Legacy Orders found awaiting acceptance. */
  found: string[]
  /** The ones this run cancelled and settled. */
  cancelled: string[]
}

/**
 * The one-off cleanup of legacy awaiting Orders (see
 * `legacy-cancellation.ts`). One Order's failure is logged and the rest
 * carry on; a later run picks it up again. No compensation: a committed
 * cancellation is authoritative, as everywhere in the engine.
 */
export const cancelLegacyAwaitingOrdersStep = createStep(
  "cancel-legacy-awaiting-orders",
  async (input: LegacyCancellationInput, { container }) => {
    const now = input.now ? new Date(input.now) : new Date()
    const found = await findLegacyAwaitingOrders(container)
    const cancelled: string[] = []
    if (input.apply)
      for (const order_id of found) {
        try {
          if (await cancelLegacyAwaitingOrder(container, order_id, now))
            cancelled.push(order_id)
        } catch (error) {
          logRecoveryFailure(container, order_id, error)
        }
      }
    return new StepResponse<LegacyCancellationResult>({ found, cancelled })
  },
)
