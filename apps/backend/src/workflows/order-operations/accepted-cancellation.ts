import type { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type {
  CancellationCategory,
  OrderOperationState,
} from "../../modules/order-operation/models/order-operation"
import { endDeliveryForOrder } from "../delivery/terminal"
import { owedRefund, purchasedFood } from "./cancellation"
import { preparedFoodCredit } from "./unassigned-cancellation-rules"

/** The guarded record as both cancellations after acceptance re-read it. */
export type AcceptedOrderRecord = {
  id: string
  restaurant_id: string
  state: OrderOperationState
  revision: number
  preparation_started_at: Date | null
  ready_at: Date | null
}

export type AcceptedCancellation = {
  record: AcceptedOrderRecord
  order_id: string
  now: Date
  cancelled_by: string
  category: CancellationCategory
  note: string | null
  /** Preparation started before this moment is prepared food. */
  prepared_before: Date | string
}

/**
 * The commit shared by every cancellation after Restaurant acceptance: the
 * unassigned deadline (#162) and the operator's Cancel with full refund
 * (#199). Run under the Order's guard once the caller's rule decided
 * `cancel`. In one transaction, before any provider is contacted, it records
 * the cancellation, the Customer's full-refund obligation and, when
 * preparation had started, the one MTOGO-funded prepared-food credit. Still
 * under the guard, the delivery ends as `cancelled` by the same actor through
 * the shared terminal boundary (#161). There is no compensation (ADR-0021);
 * settlement follows. Not committed means a concurrent change won the guarded
 * write.
 */
export async function commitAcceptedCancellation(
  container: MedusaContainer,
  cancellation: AcceptedCancellation,
): Promise<
  { committed: false } | { committed: true; has_food_credit: boolean }
> {
  const { record, order_id, now } = cancellation
  const food = await purchasedFood(container, order_id)
  const credit = preparedFoodCredit(
    record,
    food.lines,
    food.currency_code,
    cancellation.prepared_before,
  )
  const committed = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .cancelWithRefundObligation({
      id: record.id,
      order_id,
      revision: record.revision,
      state: record.state,
      cancelled_at: now,
      cancelled_by: cancellation.cancelled_by,
      category: cancellation.category,
      note: cancellation.note,
      refund: await owedRefund(container, order_id),
      food_credit: credit && { ...credit, reason: cancellation.category },
    })
  if (!committed) return { committed: false }
  await endDeliveryForOrder(container, {
    order_id,
    outcome: "cancelled",
    actor_id: cancellation.cancelled_by,
    now,
  })
  return { committed: true, has_food_credit: !!credit }
}
