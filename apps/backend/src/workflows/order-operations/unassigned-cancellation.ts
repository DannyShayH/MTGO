import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { OrderOperationState } from "../../modules/order-operation/models/order-operation"
import { endDeliveryForOrder } from "../delivery/terminal"
import { owedRefund, settleCancellation } from "./cancellation"
import { orderOperationLock } from "./locks"
import { SYSTEM_ACTOR } from "./rules"
import {
  decideUnassignedCancellation,
  preparedFoodCredit,
  type PurchasedLine,
  type UnassignedDeadlineOutcome,
} from "./unassigned-cancellation-rules"

export type UnassignedCancellationCommit = UnassignedDeadlineOutcome

type GuardedRecord = {
  id: string
  restaurant_id: string
  state: OrderOperationState
  accepted_at: Date | null
  preparation_started_at: Date | null
  ready_at: Date | null
  revision: number
}

async function purchasedFood(container: MedusaContainer, order_id: string) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["currency_code", "items.raw_unit_price", "items.quantity"],
      filters: { id: order_id },
    })
  const order = data[0] as unknown as
    { currency_code: string; items: PurchasedLine[] } | undefined
  // A paid placement always has its Order; never credit a guessed amount.
  if (!order) throw new Error(`order_not_found: ${order_id}`)
  return { currency_code: order.currency_code, lines: order.items }
}

/**
 * The guarded unassigned cancellation (#162; spec #48 stories 43-46), to be
 * run while holding the Order's guard (`orderOperationLock`), the same key
 * the claim and the operator's initial assignment take. It re-reads the
 * Order and its delivery, decides with the shared rule at `now`, and commits
 * through the shared engine's write: the cancellation by `system`, the
 * Customer's full-refund obligation and, when preparation had started, the
 * one MTOGO-funded prepared-food credit, in one transaction before any
 * provider is contacted. There is no compensation: a committed cancellation
 * is authoritative, and settlement (`settleCancellation`) follows.
 */
export async function commitUnassignedCancellation(
  container: MedusaContainer,
  request: { order_id: string; now: Date },
): Promise<UnassignedCancellationCommit> {
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
      { select: ["claim_deadline", "assigned_agent_id"], take: 1 },
    )
  const decision = decideUnassignedCancellation(
    record,
    delivery ?? null,
    request.now,
  )
  // An Order that ended by another path still ends its unassigned work, so
  // the sweep stops reading it; work that already ended keeps its outcome.
  if (decision.outcome === "already_cancelled")
    await endUnassignedWork(container, request)
  if (decision.outcome !== "cancel") return decision
  const food = await purchasedFood(container, request.order_id)
  const credit = preparedFoodCredit(
    record,
    food.lines,
    food.currency_code,
    // The decision above proved the delivery exists.
    delivery!.claim_deadline,
  )
  const committed = await service.cancelWithRefundObligation({
    id: record.id,
    order_id: request.order_id,
    revision: record.revision,
    state: record.state,
    cancelled_at: request.now,
    cancelled_by: SYSTEM_ACTOR,
    category: decision.category,
    note: null,
    refund: await owedRefund(container, request.order_id),
    food_credit: credit && { ...credit, reason: decision.category },
  })
  if (!committed) return { outcome: "changed" }
  await endUnassignedWork(container, request)
  return { outcome: "cancelled", has_food_credit: !!credit }
}

/**
 * The shared terminal boundary (#161), in the same guarded section as the
 * cancellation: the unassigned delivery ends as `cancelled` by `system`.
 */
const endUnassignedWork = (
  container: MedusaContainer,
  request: { order_id: string; now: Date },
) =>
  endDeliveryForOrder(container, {
    order_id: request.order_id,
    outcome: "cancelled",
    actor_id: SYSTEM_ACTOR,
    now: request.now,
  })

/**
 * One unassigned deadline, as the recovery sweep processes it: the guarded
 * commit under the Order's lock, then settlement after it.
 */
export async function expireUnassignedDelivery(
  container: MedusaContainer,
  order_id: string,
  now: Date,
) {
  const lock = orderOperationLock(order_id)
  const commit = await container
    .resolve(Modules.LOCKING)
    .execute(
      lock.key,
      () => commitUnassignedCancellation(container, { order_id, now }),
      { timeout: lock.timeout, expire: lock.ttl },
    )
  if (commit.outcome === "cancelled")
    await settleCancellation(container, order_id)
  return commit
}
