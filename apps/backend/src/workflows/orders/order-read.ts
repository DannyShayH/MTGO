import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  getLastFulfillmentStatus,
  getLastPaymentStatus,
} from "@medusajs/medusa/core-flows"

type OrderRecord = Record<string, unknown>

/**
 * Adds `payment_status` and `fulfillment_status` as Medusa's Order list and
 * detail workflows do. Payment collections and fulfillments read only to
 * aggregate them are dropped unless the caller asked for them.
 */
export function withAggregateStatuses<O extends object>(
  orders: O[],
  requested?: string[],
): O[] {
  const keepPayments =
    !requested || requested.some((f) => f.includes("payment_collections"))
  const keepFulfillments =
    !requested || requested.some((f) => f.includes("fulfillments"))
  for (const order of orders as unknown as OrderRecord[]) {
    order.payment_status = getLastPaymentStatus(order as never)
    order.fulfillment_status = getLastFulfillmentStatus(order as never)
    if (!keepPayments) delete order.payment_collections
    if (!keepFulfillments) delete order.fulfillments
  }
  return orders
}

/**
 * One non-draft Order, as Medusa's `getOrderDetailWorkflow` returns it, read
 * with `query.graph` directly. Throws Medusa's not-found error when it is
 * missing. Running a workflow per read kept Order history at the edge of its
 * twenty-journey two-second gate (ADR-0014).
 */
export async function readOrderDetail(
  container: MedusaContainer,
  input: { order_id: string; fields: string[] },
) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "order",
        fields: [
          ...new Set([
            ...input.fields,
            "id",
            "status",
            "version",
            "payment_collections.*",
            "fulfillments.*",
          ]),
        ],
        filters: { is_draft_order: false, id: input.order_id },
      },
      { throwIfKeyNotFound: true },
    )
  return withAggregateStatuses(data)[0]
}
