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
import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"
import { orderOperationLock } from "../order-operations/locks"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import { deliveryOutcomeOf, ORDER_CHANGED } from "../order-operations/rules"

/** How many ended deliveries one recovery sweep records; the rest wait a tick. */
export const ORDER_OUTCOME_RECOVERY_BATCH_SIZE = 50

/**
 * Copies an ended delivery's outcome and time onto the Order's kitchen
 * record (#204), so the Order leaves In progress for History. It runs under
 * the Order's guard and writes with `revision + 1` only while the record has
 * no outcome, so a repeat changes nothing and the kitchen feed announces the
 * change once. Then the delivery is marked as recorded.
 *
 * This is work owed after a committed terminal outcome (ADR-0021): it has no
 * compensation and never fails the request that ended the delivery. A
 * failure is logged and stays owed in the delivery record, and
 * `recoverOrderDeliveryOutcomesWorkflow` records it on a later tick.
 */
export async function recordDeliveryEndOnOrder(
  container: MedusaContainer,
  order_id: string,
): Promise<"recorded" | "pending"> {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const record = async () => {
    const [ended] = await delivery.listIntendedDeliveries(
      { order_id, terminal_outcome: { $ne: null } },
      { take: 1, select: ["terminal_outcome", "terminal_at"] },
    )
    if (!ended) return
    const [operation] = await operations.listOrderOperations(
      { order_id },
      { take: 1, select: ["id", "revision", "delivery_outcome"] },
    )
    if (operation && !operation.delivery_outcome) {
      const updated = await operations.updateOrderOperations({
        selector: {
          id: operation.id,
          revision: operation.revision,
          delivery_outcome: null,
        },
        data: {
          delivery_outcome: deliveryOutcomeOf(
            ended.terminal_outcome as TerminalOutcome,
          ),
          delivery_ended_at: ended.terminal_at,
          revision: operation.revision + 1,
        },
      })
      // A stale revision writes nothing: the outcome stays owed, so the
      // delivery is not marked and the next sweep records it.
      if (!updated.length)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          ORDER_CHANGED,
          ORDER_CHANGED,
        )
    }
    await delivery.markOrderOutcomeRecorded({ order_id, now: new Date() })
  }
  const lock = orderOperationLock(order_id)
  try {
    await container
      .resolve(Modules.LOCKING)
      .execute(lock.key, record, { timeout: lock.timeout, expire: lock.ttl })
    return "recorded"
  } catch (error) {
    logRecoveryFailure(container, order_id, error)
    return "pending"
  }
}

/**
 * Records the delivery's end on the Order right after it committed. Owed
 * work with no compensation (ADR-0021); see `recordDeliveryEndOnOrder`.
 */
export const recordDeliveryEndOnOrderStep = createStep(
  "record-delivery-end-on-order",
  async (input: { order_id: string }, { container }) => {
    await recordDeliveryEndOnOrder(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * One bounded sweep of ended deliveries whose outcome the Order has not
 * recorded yet, oldest first, found from durable records only. Its first
 * tick after a restart is the startup reconciliation, and the
 * `order-delivery-outcomes` migration script runs it to completion for work
 * that ended before #204.
 */
const recoverOrderDeliveryOutcomesStep = createStep(
  "recover-order-delivery-outcomes",
  async (_input: Record<string, never>, { container }) => {
    const owed = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { terminal_outcome: { $ne: null }, order_outcome_recorded_at: null },
        {
          take: ORDER_OUTCOME_RECOVERY_BATCH_SIZE,
          select: ["order_id"],
          order: { terminal_at: "ASC", id: "ASC" },
        },
      )
    const recorded: string[] = []
    for (const { order_id } of owed)
      if ((await recordDeliveryEndOnOrder(container, order_id)) === "recorded")
        recorded.push(order_id)
    return new StepResponse({ recorded })
  },
)

export const recoverOrderDeliveryOutcomesWorkflow = createWorkflow(
  "recover-order-delivery-outcomes",
  function (input: Record<string, never>) {
    return new WorkflowResponse(recoverOrderDeliveryOutcomesStep(input))
  },
)
