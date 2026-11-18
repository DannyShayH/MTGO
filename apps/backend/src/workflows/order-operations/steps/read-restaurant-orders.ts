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
  availableActions,
  OrderAction,
  queueView,
  QueueView,
} from "../rules"
import { KitchenFacts, toKitchenFacts } from "../purchased-items"
import {
  iso,
  cancellationOutcome,
  CancellationOutcome,
  refundOutcomesOf,
  RefundOutcomeView,
} from "../outcomes"
import type { CancellationCategory } from "../../../modules/order-operation/models/order-operation"

type OperationRow = {
  order_id: string
  state: OrderOperationState
  placed_at: Date | string | null
  acceptance_deadline: Date | string | null
  purchased_items?: unknown
  accepted_at: Date | string | null
  cancelled_at: Date | string | null
  cancellation_category: CancellationCategory | null
  cancellation_note: string | null
}

type OrderRow = {
  id: string
  display_id: number
  currency_code: string
  original_total: unknown
  items?: {
    id: string
    title: string
    product_title?: string | null
    variant_id?: string | null
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
  accepted_at: string | null
  /** What staff may do now, decided at the server's time. */
  available_actions: OrderAction[]
  /** Null until cancelled; then the category and actual server time. */
  cancellation:
    | (NonNullable<CancellationOutcome> & {
        /** The rejecting staff member's optional note, for their own Restaurant only. */
        note: string | null
      })
    | null
  /** The owed full refund's outcome, independent of the provider's refund rows. */
  refund: RefundOutcomeView
  currency_code: string
  /** Menu prices include VAT (ADR-0012), so purchased amounts do too. */
  total_including_vat: number
  items: {
    id: string
    name: string
    quantity: number
    unit_price_including_vat: number
    total_including_vat: number
    /** Bilingual name and declarations as purchased; staff choose the language. */
    purchased: KitchenFacts
  }[]
}

const OPERATION_FIELDS = [
  "order_id",
  "state",
  "placed_at",
  "acceptance_deadline",
  "purchased_items",
  "accepted_at",
  "cancelled_at",
  "cancellation_category",
  "cancellation_note",
] as const

const ORDER_FIELDS = [
  "id",
  "display_id",
  "currency_code",
  "original_total",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_id",
  "items.quantity",
  "items.unit_price",
  "items.total",
]

/**
 * The line items are Medusa's purchase snapshot and the kitchen facts were
 * frozen at review, so later menu edits change neither.
 */
function toRestaurantOrder(
  operation: OperationRow,
  order: OrderRow,
  refund: RefundOutcomeView | undefined,
  now: Date,
): RestaurantOrder {
  const cancellation = cancellationOutcome(operation)
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
    accepted_at: iso(operation.accepted_at),
    available_actions: availableActions(operation, now),
    cancellation: cancellation && {
      ...cancellation,
      note: operation.cancellation_note,
    },
    refund: refund ?? null,
    currency_code: order.currency_code,
    // The purchased total: a cancellation's refund credit line lowers the
    // native `total` to zero, which must not rewrite the purchase.
    total_including_vat: Number(order.original_total),
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      name: item.product_title || item.title,
      quantity: Number(item.quantity),
      unit_price_including_vat: Number(item.unit_price),
      total_including_vat: Number(item.total),
      purchased: toKitchenFacts(operation.purchased_items, item.variant_id),
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
    const [orders, refunds] = await Promise.all([
      readOrders(container, rows),
      refundOutcomesOf(
        container,
        rows
          .filter(({ state }) => state === "cancelled")
          .map((r) => r.order_id),
      ),
    ])
    const now = new Date()
    return new StepResponse({
      orders: rows
        .filter((operation) => orders.has(operation.order_id))
        .map((operation) =>
          toRestaurantOrder(
            operation,
            orders.get(operation.order_id)!,
            refunds.get(operation.order_id),
            now,
          ),
        ),
      count,
      offset: input.offset,
      limit: input.limit,
      server_time: now.toISOString(),
    })
  },
)

export const orderNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "order_not_found",
    "order_not_found",
  )

/**
 * One of the Restaurant's Orders as staff see it now. Another Restaurant's
 * Order is refused exactly like a missing one.
 */
export async function readRestaurantOrder(
  container: MedusaContainer,
  input: { restaurant_id: string; order_id: string },
) {
  const [operation] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id: input.order_id, restaurant_id: input.restaurant_id },
      { select: [...OPERATION_FIELDS], take: 1 },
    )
  const row = operation as unknown as OperationRow | undefined
  const order = row && (await readOrders(container, [row])).get(row.order_id)
  if (!row || !order) throw orderNotFound()
  const refunds = await refundOutcomesOf(container, [row.order_id])
  const now = new Date()
  return {
    order: toRestaurantOrder(row, order, refunds.get(row.order_id), now),
    server_time: now.toISOString(),
  }
}

export const retrieveRestaurantOrderStep = createStep(
  "retrieve-restaurant-order",
  async (input: { restaurant_id: string; order_id: string }, { container }) =>
    new StepResponse(await readRestaurantOrder(container, input)),
)
