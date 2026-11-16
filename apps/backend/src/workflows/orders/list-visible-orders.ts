import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import { isVisiblePlacedOrder } from "./placed-order-visibility"

type Pagination = {
  skip?: number
  take?: number | null
  order?: Record<string, unknown>
}

type Input = {
  fields: string[]
  filters: Record<string, unknown>
  pagination: Pagination
}

type Row = { id: string; metadata?: Record<string, unknown> | null }

async function listPage(
  container: MedusaContainer,
  input: Input,
  filters: Record<string, unknown>,
  pagination: Pagination,
) {
  const { result } = await getOrdersListWorkflow(container).run({
    input: {
      fields: [...new Set([...input.fields, "id", "metadata"])],
      variables: {
        filters: { ...filters, is_draft_order: false },
        skip: pagination.skip,
        take: pagination.take ?? undefined,
        order: pagination.order as Record<string, string> | undefined,
      },
    },
  })
  return result as unknown as {
    rows: Row[]
    metadata: { count: number; skip: number; take: number }
  }
}

/**
 * Keep Medusa's pagination and summary, then suppress internal placement rows.
 * One page is the common case. Only when a provisional row sits in the page do
 * we rebuild the window from visible ids, so pages stay full and `count` exact.
 *
 * This reads through Medusa's list workflow directly: wrapping it in another
 * workflow measurably slowed Order history (the 2-second concurrent gate).
 */
export async function listVisibleOrders(
  container: MedusaContainer,
  input: Input,
) {
  const page = await listPage(container, input, input.filters, input.pagination)
  const visible = page.rows.filter(isVisiblePlacedOrder)
  if (visible.length === page.rows.length)
    return {
      orders: visible,
      count: page.metadata.count,
      offset: page.metadata.skip,
      limit: page.metadata.take,
    }

  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { ...input.filters, is_draft_order: false } as never,
      pagination: { order: input.pagination.order } as never,
    })
  const visibleIds = (data as Row[])
    .filter(isVisiblePlacedOrder)
    .map((o) => o.id)
  const skip = page.metadata.skip
  const take = page.metadata.take
  const ids = visibleIds.slice(skip, skip + take)
  const rebuilt = ids.length
    ? await listPage(
        container,
        input,
        { ...input.filters, id: ids },
        { skip: 0, take: ids.length, order: input.pagination.order },
      )
    : { rows: [] as Row[] }
  return {
    orders: rebuilt.rows,
    count: visibleIds.length,
    offset: skip,
    limit: take,
  }
}
