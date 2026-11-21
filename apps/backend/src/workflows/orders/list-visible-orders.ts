import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OrderFacts, visiblePlacedOrderFilter } from "./placed-order-visibility"
import { withOrderOperations } from "./order-operations-of"
import { withAggregateStatuses } from "./order-read"

type Pagination = {
  skip?: number
  take?: number
  order?: Record<string, unknown>
}

type Input = {
  fields: string[]
  filters: Record<string, unknown>
  pagination: Pagination
}

type Row = OrderFacts & { id: string }

/** Fields Medusa's `getOrdersListWorkflow` always reads to aggregate statuses. */
const LIST_STATUS_FIELDS = [
  "id",
  "status",
  "version",
  "items.*",
  "payment_collections.status",
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

/** The caller's filters plus one more condition, keeping any `$and` of theirs. */
const addAndCondition = (
  filters: Record<string, unknown>,
  condition: object,
) => ({
  ...filters,
  $and: [...((filters.$and as unknown[] | undefined) ?? []), condition],
})

/**
 * Medusa's Order list over visible placed Orders only: pages stay full, the
 * requested ordering is kept and `count` is exact whatever page is asked for.
 * Each Order carries its operational state, so Order history can label it.
 */
export async function listVisibleOrders(
  container: MedusaContainer,
  input: Input,
) {
  // One list query filters on the placement marker (#154), so `count` comes
  // from the database. It returns what Medusa's `getOrdersListWorkflow` does,
  // read with `query.graph` directly: running a workflow per read kept Order
  // history at the edge of its twenty-journey two-second gate (ADR-0014).
  const requested = [...new Set([...input.fields, "id", "metadata"])]
  const { data, metadata } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: [...new Set([...requested, ...LIST_STATUS_FIELDS])],
      filters: {
        ...addAndCondition(input.filters, visiblePlacedOrderFilter),
        is_draft_order: false,
      } as Record<string, unknown>,
      pagination: {
        skip: input.pagination.skip,
        take: input.pagination.take,
        order: input.pagination.order as Record<string, string> | undefined,
      },
    })
  const rows = withAggregateStatuses(data, requested) as unknown as Row[]
  return {
    orders: await withOrderOperations(container, rows),
    count: metadata?.count,
    offset: metadata?.skip,
    limit: metadata?.take,
  }
}
