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
  queueFilter,
  QueueFilters,
  queueView,
  QueueView,
} from "../rules"
import { KitchenFacts, toKitchenFacts } from "../purchased-items"
import { financialBasisView } from "../financial-basis"
import {
  iso,
  cancellationOutcome,
  CancellationOutcome,
  foodCreditsOf,
  type FoodCreditView,
  refundOutcomesOf,
  RefundOutcomeView,
} from "../outcomes"
import type {
  CancellationCategory,
  DeliveryOutcome,
} from "../../../modules/order-operation/models/order-operation"

type OperationRow = {
  order_id: string
  state: OrderOperationState
  placed_at: Date | string | null
  acceptance_deadline: Date | string | null
  purchased_items?: unknown
  accepted_at: Date | string | null
  preparation_started_at: Date | string | null
  ready_at: Date | string | null
  cancelled_at: Date | string | null
  cancellation_category: CancellationCategory | null
  cancellation_note: string | null
  delivery_outcome: DeliveryOutcome | null
  delivery_ended_at: Date | string | null
}

type OrderRow = {
  id: string
  display_id: number
  currency_code: string
  original_total: unknown
  /** Always read: ORDER_FIELDS selects them. */
  items: {
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
  /** The kitchen milestones (#146); actors stay in the record. */
  preparation_started_at: string | null
  ready_at: string | null
  /** What staff may do now, decided at the server's time. */
  available_actions: OrderAction[]
  /** Null until cancelled; then the category and actual server time. */
  cancellation:
    | (NonNullable<CancellationOutcome> & {
        /** The rejecting staff member's optional note, for their own Restaurant only. */
        note: string | null
      })
    | null
  /**
   * How and when the Order's delivery ended (#204); null while it has not.
   * A cancelled Order's cancellation stays the reason it ended.
   */
  delivery: { outcome: DeliveryOutcome; ended_at: string } | null
  /** The owed full refund's outcome, independent of the provider's refund rows. */
  refund: RefundOutcomeView
  /** The MTOGO-funded prepared-food credit this Order owes the Restaurant (#162). */
  food_credit: FoodCreditView
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
  "preparation_started_at",
  "ready_at",
  "cancelled_at",
  "cancellation_category",
  "cancellation_note",
  "delivery_outcome",
  "delivery_ended_at",
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
  food_credit: FoodCreditView | undefined,
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
    preparation_started_at: iso(operation.preparation_started_at),
    ready_at: iso(operation.ready_at),
    available_actions: availableActions(operation, now),
    cancellation: cancellation && {
      ...cancellation,
      note: operation.cancellation_note,
    },
    delivery: operation.delivery_outcome
      ? {
          outcome: operation.delivery_outcome,
          ended_at: iso(operation.delivery_ended_at)!,
        }
      : null,
    refund: refund ?? null,
    food_credit: food_credit ?? null,
    currency_code: order.currency_code,
    // The purchased total: a cancellation's refund credit line lowers the
    // native `total` to zero, which must not rewrite the purchase.
    total_including_vat: Number(order.original_total),
    items: order.items.map((item) => ({
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
  /** An Order number (`display_id`) staff searched for. */
  display_id?: number
  filters: QueueFilters
}

/** The Order ids carrying a number; ownership is checked by the queue filter. */
async function findOrderIdsByNumber(
  container: MedusaContainer,
  display_id: number,
) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    // Query types `display_id` filters as text; PostgreSQL compares it as the integer.
    .graph({
      entity: "order",
      fields: ["id"],
      filters: { display_id: String(display_id) },
    })
  return (data as { id: string }[]).map(({ id }) => id)
}

/**
 * One page of a Restaurant's queue, filtered, ordered and paginated in the
 * module. Ownership is the record's immutable Restaurant, so closing or
 * deactivating the Restaurant does not hide its Orders.
 */
export const listRestaurantOrdersStep = createStep(
  "list-restaurant-orders",
  async (input: ListRestaurantOrdersInput, { container }) => {
    const { order } = queueView(input.view)
    const orderIds =
      input.display_id === undefined
        ? undefined
        : await findOrderIdsByNumber(container, input.display_id)
    const [operations, count] =
      orderIds?.length === 0
        ? [[], 0]
        : await container
            .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
            .listAndCountOrderOperations(
              queueFilter(
                input.restaurant_id,
                input.view,
                input.filters,
                orderIds,
              ),
              {
                select: [...OPERATION_FIELDS],
                order,
                take: input.limit,
                skip: input.offset,
              },
            )
    const rows = operations as unknown as OperationRow[]
    const cancelled = rows
      .filter(({ state }) => state === "cancelled")
      .map((r) => r.order_id)
    const [orders, refunds, credits] = await Promise.all([
      readOrders(container, rows),
      refundOutcomesOf(container, cancelled),
      foodCreditsOf(container, cancelled),
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
            credits.get(operation.order_id),
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
  input: {
    restaurant_id: string
    order_id: string
    /** Adds the purchased financial basis (#226) while it is released. */
    include_financial_basis?: boolean
  },
) {
  const [operation] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id: input.order_id, restaurant_id: input.restaurant_id },
      {
        select: [...OPERATION_FIELDS, "restaurant_id", "financial_basis"],
        take: 1,
      },
    )
  const row = operation as unknown as
    | (OperationRow & { restaurant_id: string; financial_basis: unknown })
    | undefined
  const order = row && (await readOrders(container, [row])).get(row.order_id)
  if (!row || !order) throw orderNotFound()
  const [refunds, credits] = await Promise.all([
    refundOutcomesOf(container, [row.order_id]),
    foodCreditsOf(container, [row.order_id]),
  ])
  const now = new Date()
  const restaurantOrder = toRestaurantOrder(
    row,
    order,
    refunds.get(row.order_id),
    now,
    credits.get(row.order_id),
  )
  return {
    order: input.include_financial_basis
      ? {
          ...restaurantOrder,
          financial_basis: financialBasisView(row.financial_basis, row),
        }
      : restaurantOrder,
    server_time: now.toISOString(),
  }
}

export const retrieveRestaurantOrderStep = createStep(
  "retrieve-restaurant-order",
  async (
    input: {
      restaurant_id: string
      order_id: string
      include_financial_basis?: boolean
    },
    { container },
  ) => new StepResponse(await readRestaurantOrder(container, input)),
)
