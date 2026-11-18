import { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"

export type OrderOperationSummary = { id: string; state: string }

/**
 * Attaches each Order's operational record with one indexed query on
 * `order_id`. Cheaper than the read-only link inside Medusa's list workflow,
 * which kept Order history near its two-second concurrent gate.
 */
export async function withOrderOperations<R extends { id: string }>(
  container: MedusaContainer,
  rows: R[],
): Promise<(R & { order_operation: OrderOperationSummary | null })[]> {
  if (!rows.length) return []
  const records = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id: rows.map(({ id }) => id) },
      { select: ["id", "order_id", "state"] },
    )
  const byOrder = new Map(
    records.map((record) => [
      record.order_id,
      { id: record.id, state: record.state },
    ]),
  )
  return rows.map((row) => ({
    ...row,
    order_operation: byOrder.get(row.id) ?? null,
  }))
}
