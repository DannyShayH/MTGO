import { MedusaContainer } from "@medusajs/framework/types"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import { OrderFacts, visiblePlacedOrderFilter } from "./placed-order-visibility"
import { withOrderOperations } from "./order-operations-of"

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
  // from the database. A separate lookup of provisional rows grew with every
  // reviewed checkout. This reads through Medusa's list workflow directly,
  // since wrapping it in another workflow measurably slowed Order history.
  const { result } = await getOrdersListWorkflow(container).run({
    input: {
      fields: [...new Set([...input.fields, "id", "metadata"])],
      variables: {
        filters: {
          ...addAndCondition(input.filters, visiblePlacedOrderFilter),
          is_draft_order: false,
        },
        skip: input.pagination.skip,
        take: input.pagination.take,
        order: input.pagination.order as Record<string, string> | undefined,
      },
    },
  })
  const page = result as unknown as {
    rows: Row[]
    metadata: { count: number; skip: number; take: number }
  }
  return {
    orders: await withOrderOperations(container, page.rows),
    count: page.metadata.count,
    offset: page.metadata.skip,
    limit: page.metadata.take,
  }
}
