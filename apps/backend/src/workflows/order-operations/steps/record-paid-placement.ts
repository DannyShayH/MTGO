import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import { acceptanceDeadline } from "../rules"
import { toJsonColumn, type PurchasedItem } from "../purchased-items"
import type { StoredFinancialBasis } from "../financial-basis"

type Input = {
  order_id: string
  restaurant_id: string
  purchased_items: PurchasedItem[] | null
  financial_basis: StoredFinancialBasis | null
}

/**
 * Creates the Order's one operational record: its paid placement time, the
 * acceptance deadline, immutable Restaurant ownership and the purchased
 * kitchen facts frozen at review, and the purchased financial basis (#226)
 * in the same write, so no paid placement exists without it. This is the write
 * that exposes the Order as placed, so it runs after capture and linking.
 */
export const recordPaidPlacementStep = createStep(
  "record-paid-placement",
  async (input: Input, { container }) => {
    const placedAt = new Date()
    const record = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .createOrderOperations({
        order_id: input.order_id,
        restaurant_id: input.restaurant_id,
        placed_at: placedAt,
        acceptance_deadline: acceptanceDeadline(placedAt),
        purchased_items: toJsonColumn(input.purchased_items),
        financial_basis: toJsonColumn(input.financial_basis),
      })
    return new StepResponse(record, record.id)
  },
  async (id, { container }) => {
    if (!id) return
    await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .deleteOrderOperations(id)
  },
)
