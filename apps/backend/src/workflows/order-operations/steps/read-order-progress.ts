import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import type {
  CancellationCategory,
  OrderOperationState,
} from "../../../modules/order-operation/models/order-operation"
import {
  iso,
  cancellationOutcome,
  CancellationOutcome,
  refundOutcomesOf,
  RefundOutcomeView,
} from "../outcomes"
import { orderNotFound } from "./read-restaurant-orders"

type Row = {
  order_id: string
  state: OrderOperationState
  placed_at: Date | string | null
  accepted_at: Date | string | null
  preparation_started_at: Date | string | null
  ready_at: Date | string | null
  cancelled_at: Date | string | null
  cancellation_category: CancellationCategory | null
  acceptance_deadline: Date | string | null
}

/**
 * What the owning Customer sees of their Order's progress (#143): factual
 * milestones (placement, acceptance and, since #146, preparation start and
 * food readiness), the cancellation category and the refund outcome. Staff
 * identities and the internal rejection note are never part of it.
 */
export type OrderProgress = {
  order_id: string
  state: OrderOperationState
  placed_at: string | null
  accepted_at: string | null
  preparation_started_at: string | null
  ready_at: string | null
  cancellation: CancellationOutcome
  refund: RefundOutcomeView
}

export const readOrderProgressStep = createStep(
  "read-order-progress",
  async (input: { order_id: string }, { container }) => {
    const [found] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id: input.order_id },
        {
          select: [
            "order_id",
            "state",
            "placed_at",
            "accepted_at",
            "preparation_started_at",
            "ready_at",
            "cancelled_at",
            "cancellation_category",
            "acceptance_deadline",
          ],
          take: 1,
        },
      )
    const row = found as unknown as Row | undefined
    if (!row) throw orderNotFound()
    const refunds = await refundOutcomesOf(container, [row.order_id])
    const progress: OrderProgress = {
      order_id: row.order_id,
      state: row.state,
      placed_at: iso(row.placed_at),
      accepted_at: iso(row.accepted_at),
      preparation_started_at: iso(row.preparation_started_at),
      ready_at: iso(row.ready_at),
      cancellation: cancellationOutcome(row),
      refund: refunds.get(row.order_id) ?? null,
    }
    return new StepResponse({ progress, server_time: new Date().toISOString() })
  },
)
