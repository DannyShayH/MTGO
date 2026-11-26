import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { orderOperationLock } from "../order-operations/locks"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import { ORDER_CHANGED } from "../order-operations/rules"

/** How many collected deliveries one recovery sweep records; the rest wait a tick. */
export const ORDER_PICKUP_RECOVERY_BATCH_SIZE = 50

/**
 * Copies the agent's pickup time onto the Order's kitchen record (#254), so
 * the Restaurant sees its food has left. Only the time is copied, never the
 * agent (ADR-0008). It runs under the Order's guard and writes with
 * `revision + 1` only while the record has no pickup time, so a repeat
 * changes nothing and the kitchen feed announces the pickup once. Then the
 * delivery is marked as recorded.
 *
 * This is work owed after a committed pickup (ADR-0021): it has no
 * compensation and never fails the agent's request. A failure is logged and
 * stays owed in the delivery record, and `recoverOrderDeliveryPickupsWorkflow`
 * records it on a later tick.
 */
export async function recordPickupOnOrder(
  container: MedusaContainer,
  orderId: string,
): Promise<"recorded" | "pending"> {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const record = async () => {
    const [collected] = await delivery.listIntendedDeliveries(
      { order_id: orderId, picked_up_at: { $ne: null } },
      { take: 1, select: ["picked_up_at"] },
    )
    if (!collected) return
    const [operation] = await operations.listOrderOperations(
      { order_id: orderId },
      { take: 1, select: ["id", "revision", "delivery_picked_up_at"] },
    )
    if (operation && !operation.delivery_picked_up_at) {
      const updated = await operations.updateOrderOperations({
        selector: {
          id: operation.id,
          revision: operation.revision,
          delivery_picked_up_at: null,
        },
        data: {
          delivery_picked_up_at: collected.picked_up_at,
          revision: operation.revision + 1,
        },
      })
      // A stale revision writes nothing: the pickup stays owed, so the
      // delivery is not marked and the next sweep records it.
      if (!updated.length)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          ORDER_CHANGED,
          ORDER_CHANGED,
        )
    }
    await delivery.markOrderPickupRecorded({
      order_id: orderId,
      now: new Date(),
    })
  }
  const lock = orderOperationLock(orderId)
  try {
    await container
      .resolve(Modules.LOCKING)
      .execute(lock.key, record, { timeout: lock.timeout, expire: lock.ttl })
    return "recorded"
  } catch (error) {
    logRecoveryFailure(container, orderId, error)
    return "pending"
  }
}

/**
 * Records the pickup on the Order right after it committed. Owed work with
 * no compensation (ADR-0021); see `recordPickupOnOrder`.
 */
export const recordPickupOnOrderStep = createStep(
  "record-pickup-on-order",
  async (input: { order_id: string }, { container }) => {
    await recordPickupOnOrder(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * One bounded sweep of collected deliveries whose pickup the Order has not
 * recorded yet, oldest first, found from durable records only. Its first
 * tick after a restart is the startup reconciliation, and the
 * `order-delivery-pickups` migration script runs it to completion for
 * pickups made before #254.
 */
const recoverOrderDeliveryPickupsStep = createStep(
  "recover-order-delivery-pickups",
  async (_input: Record<string, never>, { container }) => {
    const owed = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { picked_up_at: { $ne: null }, order_pickup_recorded_at: null },
        {
          take: ORDER_PICKUP_RECOVERY_BATCH_SIZE,
          select: ["order_id"],
          order: { picked_up_at: "ASC", id: "ASC" },
        },
      )
    const recorded: string[] = []
    for (const { order_id } of owed)
      if ((await recordPickupOnOrder(container, order_id)) === "recorded")
        recorded.push(order_id)
    return new StepResponse({ recorded })
  },
)

export const recoverOrderDeliveryPickupsWorkflow = createWorkflow(
  "recover-order-delivery-pickups",
  function (input: Record<string, never>) {
    return new WorkflowResponse(recoverOrderDeliveryPickupsStep(input))
  },
)
