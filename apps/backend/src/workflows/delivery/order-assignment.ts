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

/** How many assigned deliveries one recovery sweep records; the rest wait a tick. */
export const ORDER_ASSIGNMENT_RECOVERY_BATCH_SIZE = 50

/**
 * Copies the assignment time onto the Order's kitchen record (#259), so the
 * Open Order stages come from that one record. Only the time is copied,
 * never the agent (ADR-0008). It runs under the Order's guard and writes
 * with `revision + 1` only while the record has no assignment time, so a
 * repeat changes nothing. Then the delivery is marked as recorded.
 *
 * This is work owed after a committed assignment (ADR-0021): it has no
 * compensation and never fails the claim or the operator's assignment. A
 * failure is logged and stays owed in the delivery record, and
 * `recoverOrderDeliveryAssignmentsWorkflow` records it on a later tick.
 */
export async function recordAssignmentOnOrder(
  container: MedusaContainer,
  orderId: string,
): Promise<"recorded" | "pending"> {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const record = async () => {
    const [assigned] = await delivery.listIntendedDeliveries(
      { order_id: orderId, assigned_at: { $ne: null } },
      { take: 1, select: ["assigned_at"] },
    )
    if (!assigned) return
    const [operation] = await operations.listOrderOperations(
      { order_id: orderId },
      { take: 1, select: ["id", "revision", "delivery_assigned_at"] },
    )
    if (operation && !operation.delivery_assigned_at) {
      const updated = await operations.updateOrderOperations({
        selector: {
          id: operation.id,
          revision: operation.revision,
          delivery_assigned_at: null,
        },
        data: {
          delivery_assigned_at: assigned.assigned_at,
          revision: operation.revision + 1,
        },
      })
      // A stale revision writes nothing: the assignment stays owed, so the
      // delivery is not marked and the next sweep records it.
      if (!updated.length)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          ORDER_CHANGED,
          ORDER_CHANGED,
        )
    }
    await delivery.markOrderAssignmentRecorded({
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
 * Records the assignment on the Order right after it committed, outside the
 * assignment's own guard. Owed work with no compensation (ADR-0021); see
 * `recordAssignmentOnOrder`.
 */
export const recordAssignmentOnOrderStep = createStep(
  "record-assignment-on-order",
  async (input: { order_id: string }, { container }) => {
    await recordAssignmentOnOrder(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * One bounded sweep of assigned deliveries whose assignment the Order has
 * not recorded yet, oldest first, found from durable records only. Its
 * first tick after a restart is the startup reconciliation, and the
 * `order-delivery-assignments` migration script runs it to completion for
 * assignments made before #259.
 */
const recoverOrderDeliveryAssignmentsStep = createStep(
  "recover-order-delivery-assignments",
  async (_input: Record<string, never>, { container }) => {
    const owed = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { assigned_at: { $ne: null }, order_assignment_recorded_at: null },
        {
          take: ORDER_ASSIGNMENT_RECOVERY_BATCH_SIZE,
          select: ["order_id"],
          order: { assigned_at: "ASC", id: "ASC" },
        },
      )
    const recorded: string[] = []
    for (const { order_id } of owed)
      if ((await recordAssignmentOnOrder(container, order_id)) === "recorded")
        recorded.push(order_id)
    return new StepResponse({ recorded })
  },
)

export const recoverOrderDeliveryAssignmentsWorkflow = createWorkflow(
  "recover-order-delivery-assignments",
  function (input: Record<string, never>) {
    return new WorkflowResponse(recoverOrderDeliveryAssignmentsStep(input))
  },
)
