import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { OrderOperationState } from "../../modules/order-operation/models/order-operation"
import { owedRefund, settleCancellation } from "./cancellation"
import { orderOperationLock } from "./locks"
import { SYSTEM_ACTOR } from "./rules"

/** How many legacy Orders one page reads; the run continues page by page. */
export const LEGACY_BATCH_SIZE = 50

type LegacyRecord = {
  id: string
  state: OrderOperationState
  acceptance_deadline: Date | null
  revision: number
}

const isLegacyAwaiting = (record: LegacyRecord | undefined) =>
  !!record &&
  record.state === "awaiting_acceptance" &&
  record.acceptance_deadline === null

/**
 * Legacy Orders still awaiting acceptance: placed before the module existed,
 * so they have no deadline and no rule can time them out, and staff see
 * "Timing unknown" forever. Oldest record first, every page.
 */
export async function findLegacyAwaitingOrders(container: MedusaContainer) {
  const service = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const found: string[] = []
  for (let skip = 0; ; skip += LEGACY_BATCH_SIZE) {
    const page = await service.listOrderOperations(
      { state: "awaiting_acceptance", acceptance_deadline: null },
      {
        select: ["order_id"],
        skip,
        take: LEGACY_BATCH_SIZE,
        order: { created_at: "ASC", id: "ASC" },
      },
    )
    found.push(...page.map(({ order_id }) => order_id))
    if (page.length < LEGACY_BATCH_SIZE) return found
  }
}

/**
 * Ends one legacy awaiting Order once, as an operator-run cleanup: under the
 * Order's lock it re-reads the record and, while it is still legacy and
 * awaiting, commits the system's `acceptance_timeout` cancellation with its
 * full-refund obligation through the guarded module write. Then the shared
 * settlement attempts the refund as `system` and cancels the native Order.
 *
 * No deadline is invented: the cancellation takes effect when it is
 * processed. Anything else (already cancelled, accepted meanwhile, given a
 * deadline) is left alone, so a repeat or a race adds nothing.
 */
export async function cancelLegacyAwaitingOrder(
  container: MedusaContainer,
  order_id: string,
  now: Date,
): Promise<boolean> {
  const service = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const lock = orderOperationLock(order_id)
  const committed = await container.resolve(Modules.LOCKING).execute(
    lock.key,
    async () => {
      const [record] = (await service.listOrderOperations(
        { order_id },
        {
          select: ["id", "state", "acceptance_deadline", "revision"],
          take: 1,
        },
      )) as unknown as LegacyRecord[]
      if (!isLegacyAwaiting(record)) return false
      return service.cancelWithRefundObligation({
        id: record.id,
        order_id,
        revision: record.revision,
        state: record.state,
        cancelled_at: now,
        cancelled_by: SYSTEM_ACTOR,
        category: "acceptance_timeout",
        note: null,
        refund: await owedRefund(container, order_id),
      })
    },
    { timeout: lock.timeout, expire: lock.ttl },
  )
  if (committed) await settleCancellation(container, order_id, SYSTEM_ACTOR)
  return committed
}
