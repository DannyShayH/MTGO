import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type {
  DeliveryOutcome,
  OrderOperationState,
} from "../../modules/order-operation/models/order-operation"
import { endDeliveryForOrder } from "../delivery/terminal"
import { commitAcceptedCancellation } from "./accepted-cancellation"
import { orderOperationLock } from "./locks"
import {
  decideOperatorCancellation,
  type OperatorCancellationDecision,
} from "./operator-cancellation-rules"

export type OperatorCancellationRequest = {
  order_id: string
  /** The signed-in operator's user id, recorded as the cancellation's actor. */
  operator_id: string
  /** The required reason, already cleaned and bounded by the validator. */
  reason: string
  now: Date
}

export type OperatorCancellationCommit =
  | { outcome: "not_found" }
  | Exclude<OperatorCancellationDecision, { outcome: "cancel" }>
  | { outcome: "changed" }
  | { outcome: "cancelled"; cancelled_by: string }

type GuardedRecord = {
  id: string
  restaurant_id: string
  state: OrderOperationState
  accepted_at: Date | null
  preparation_started_at: Date | null
  ready_at: Date | null
  delivery_outcome: DeliveryOutcome | null
  cancelled_by: string | null
  revision: number
}

/**
 * The guarded Operator cancellation (#199; spec #49 stories 25-40), to be run
 * while holding the Order's guard (`orderOperationLock`), the key claim,
 * pickup, handover and the kitchen milestones also take. It re-reads the
 * Order and its delivery and decides with the shared rule. In one
 * transaction, before any provider is contacted, it commits the cancellation
 * by the operator with `operator_cancelled` and the reason, the Customer's
 * full-refund obligation and, when preparation had started, the one
 * MTOGO-funded prepared-food credit (#162's calculation). Still under the
 * guard, the delivery ends as `cancelled` through the shared terminal
 * boundary: the agent is freed, earlier milestones stay and attention is
 * resolved. There is no compensation (ADR-0021); settlement follows.
 */
export async function commitOperatorCancellation(
  container: MedusaContainer,
  request: OperatorCancellationRequest,
): Promise<OperatorCancellationCommit> {
  const service = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const [record] = (await service.listOrderOperations(
    { order_id: request.order_id },
    {
      select: [
        "id",
        "restaurant_id",
        "state",
        "accepted_at",
        "preparation_started_at",
        "ready_at",
        "delivery_outcome",
        "cancelled_by",
        "revision",
      ],
      take: 1,
    },
  )) as unknown as GuardedRecord[]
  if (!record) return { outcome: "not_found" }
  const [delivery] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      { order_id: request.order_id },
      { select: ["terminal_outcome"], take: 1 },
    )
  const decision = decideOperatorCancellation(record, delivery ?? null)
  // A repeat finishes what an interrupted cancellation left: work that has
  // not ended yet ends as cancelled by the recorded actor, so no agent stays
  // bound to a cancelled Order. Work that already ended keeps its outcome;
  // the recovery sweep settles the refund (#144).
  if (decision.outcome === "already_cancelled")
    await endDeliveryForOrder(container, {
      order_id: request.order_id,
      outcome: "cancelled",
      actor_id: record.cancelled_by ?? request.operator_id,
      now: request.now,
    })
  if (decision.outcome !== "cancel") return decision
  const commit = await commitAcceptedCancellation(container, {
    record,
    order_id: request.order_id,
    now: request.now,
    cancelled_by: request.operator_id,
    category: decision.category,
    note: request.reason,
    // Any preparation recorded before this cancellation is prepared food.
    prepared_before: request.now,
  })
  if (!commit.committed) return { outcome: "changed" }
  return { outcome: "cancelled", cancelled_by: request.operator_id }
}

/** The guarded commit under the Order's lock, as the operator's request runs it. */
export const cancelByOperator = (
  container: MedusaContainer,
  request: Omit<OperatorCancellationRequest, "now">,
) => {
  const lock = orderOperationLock(request.order_id)
  return container.resolve(Modules.LOCKING).execute(
    lock.key,
    () =>
      commitOperatorCancellation(container, {
        ...request,
        // Decided at the guarded moment, not when the request arrived.
        now: new Date(),
      }),
    { timeout: lock.timeout, expire: lock.ttl },
  )
}
