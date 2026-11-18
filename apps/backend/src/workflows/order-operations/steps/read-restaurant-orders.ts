import { MedusaContainer } from "@medusajs/framework/types"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import type { OrderOperationState } from "../../../modules/order-operation/models/order-operation"
import {
  AcceptanceWindow,
  acceptanceWindow,
  queueView,
  QueueView,
} from "../rules"

type OperationRow = {
  order_id: string
  state: OrderOperationState
  placed_at: Date | string | null
  acceptance_deadline: Date | string | null
}

type OrderRow = {
  id: string
  display_id: number
  currency_code: string
  total: unknown
  items?: {
    id: string
    title: string
    product_title?: string | null
    quantity: unknown
    unit_price: unknown
    total: unknown
  }[]
}

/** What staff see of an Order: no Customer account or contact details. */
export type RestaurantOrder = {
  id: string
  display_id: number
  state: OrderOperationState
  placed_at: string | null
  acceptance_deadline: string | null
  acceptance_window: AcceptanceWindow
  currency_code: string
  /** Menu prices include VAT (ADR-0012), so purchased amounts do too. */
  total_including_vat: number
  items: {
    id: string
    name: string
    quantity: number
    unit_price_including_vat: number
    total_including_vat: number
  }[]
}

const OPERATION_FIELDS = [
  "order_id",
  "state",
  "placed_at",
  "acceptance_deadline",
] as const

const ORDER_FIELDS = [
  "id",
  "display_id",
  "currency_code",
  "total",
  "items.id",
  "items.title",
  "items.product_title",
  "items.quantity",
  "items.unit_price",
  "items.total",
]

const iso = (value: Date | string | null) =>
  value ? new Date(value).toISOString() : null

/** The line items are Medusa's purchase snapshot, so later menu edits do not change them. */
function toRestaurantOrder(
  operation: OperationRow,
  order: OrderRow,
  now: Date,
): RestaurantOrder {
  return {
    id: order.id,
    display_id: order.display_id,
    state: operation.state,
    placed_at: iso(operation.placed_at),
    acceptance_deadline: iso(operation.acceptance_deadline),
    acceptance_window:
      operation.state === "awaiting_acceptance"
        ? acceptanceWindow(operation.acceptance_deadline, now)
        : "unavailable",
    currency_code: order.currency_code,
    total_including_vat: Number(order.total),
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      name: item.product_title || item.title,
      quantity: Number(item.quantity),
      unit_price_including_vat: Number(item.unit_price),
      total_including_vat: Number(item.total),
    })),
  }
}

async function readOrders(
  container: MedusaContainer,
  operations: OperationRow[],
) {
  if (!operations.length) return new Map<string, OrderRow>()
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: { id: operations.map(({ order_id }) => order_id) },
    })
  return new Map((data as unknown as OrderRow[]).map((o) => [o.id, o]))
}

export type ListRestaurantOrdersInput = {
  restaurant_id: string
  view: QueueView
  limit: number
  offset: number
}

/**
 * One page of a Restaurant's queue, filtered, ordered and paginated in the
 * module. Ownership is the record's immutable Restaurant, so closing or
 * deactivating the Restaurant does not hide its Orders.
 */
export const listRestaurantOrdersStep = createStep(
  "list-restaurant-orders",
  async (input: ListRestaurantOrdersInput, { container }) => {
    const { states, order } = queueView(input.view)
    const [operations, count] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listAndCountOrderOperations(
        { restaurant_id: input.restaurant_id, state: states },
        {
          select: [...OPERATION_FIELDS],
          order,
          take: input.limit,
          skip: input.offset,
        },
      )
    const rows = operations as unknown as OperationRow[]
    const orders = await readOrders(container, rows)
    const now = new Date()
    return new StepResponse({
      orders: rows
        .filter((operation) => orders.has(operation.order_id))
        .map((operation) =>
          toRestaurantOrder(operation, orders.get(operation.order_id)!, now),
        ),
      count,
      offset: input.offset,
      limit: input.limit,
      server_time: now.toISOString(),
    })
  },
)

/** Another Restaurant's Order is refused exactly like a missing one. */
export const retrieveRestaurantOrderStep = createStep(
  "retrieve-restaurant-order",
  async (input: { restaurant_id: string; order_id: string }, { container }) => {
    const [operation] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id: input.order_id, restaurant_id: input.restaurant_id },
        { select: [...OPERATION_FIELDS], take: 1 },
      )
    const row = operation as unknown as OperationRow | undefined
    const order = row && (await readOrders(container, [row])).get(row.order_id)
    if (!row || !order)
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
    const now = new Date()
    return new StepResponse({
      order: toRestaurantOrder(row, order, now),
      server_time: now.toISOString(),
    })
  },
)
