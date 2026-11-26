import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { CancellationCategory } from "../../modules/order-operation/models/order-operation"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { exactAmount } from "./calculation"
import {
  cancellationRecognition,
  type CancellationFacts,
} from "./cancellation-rules"

export type CancelledRecord = {
  order_id: string
  restaurant_id: string
  cancellation_category: CancellationCategory | null
  cancelled_at: Date | string | null
  acceptance_deadline: Date | string | null
}

export const CANCELLED_FIELDS = [
  "order_id",
  "restaurant_id",
  "cancellation_category",
  "cancelled_at",
  "acceptance_deadline",
]

/** A cancelled Order's facts as the rule reads them, with its Restaurant. */
export type CancelledOrder = CancellationFacts & { restaurant_id: string }

/**
 * The facts of cancelled Orders: each record with its prepared-food credit
 * and its delivery's claim deadline, if it had accepted work.
 */
export async function cancelledOrdersOf(
  container: MedusaContainer,
  records: CancelledRecord[],
): Promise<CancelledOrder[]> {
  const cancelled = records.filter(({ cancelled_at }) => !!cancelled_at)
  if (!cancelled.length) return []
  const order_id = cancelled.map(({ order_id }) => order_id)
  const [credits, deliveries] = await Promise.all([
    container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listFoodCredits(
        { order_id },
        {
          take: null,
          select: [
            "id",
            "order_id",
            "amount",
            "raw_amount",
            "commission_amount",
            "raw_commission_amount",
            "currency_code",
            "funded_by",
            "reason",
            "preparation_started_at",
            "ready_at",
          ],
        },
      ),
    container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { order_id },
        { take: null, select: ["order_id", "claim_deadline"] },
      ),
  ])
  const creditOf = new Map(credits.map((credit) => [credit.order_id, credit]))
  const deadlineOf = new Map(
    deliveries.map(({ order_id, claim_deadline }) => [
      order_id,
      claim_deadline,
    ]),
  )
  return cancelled.map((record) => {
    const credit = creditOf.get(record.order_id)
    return {
      order_id: record.order_id,
      restaurant_id: record.restaurant_id,
      category: record.cancellation_category,
      cancelled_at: record.cancelled_at as Date,
      acceptance_deadline: record.acceptance_deadline,
      claim_deadline: deadlineOf.get(record.order_id) ?? null,
      food_credit: credit
        ? {
            id: credit.id,
            amount: exactAmount(credit, "amount"),
            commission_amount: exactAmount(credit, "commission_amount"),
            currency_code: credit.currency_code,
            funded_by: credit.funded_by,
            reason: credit.reason,
            preparation_started_at: credit.preparation_started_at,
            ready_at: credit.ready_at,
          }
        : null,
    }
  })
}

/**
 * The cancelled Orders that finance has not accounted for: their source has
 * neither a receipt nor an evidence problem.
 */
export async function unaccountedCancellations(
  container: MedusaContainer,
  orders: CancelledOrder[],
  cutoff?: Date,
) {
  if (!orders.length) return []
  const recognitions = orders.map((order) => ({
    order,
    recognition: cancellationRecognition(order),
  }))
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const filters = {
    source_id: recognitions.map(({ recognition }) => recognition.source.id),
  }
  const [receipts, problems] = await Promise.all([
    finance.listFinanceReceipts(
      { ...filters, ...(cutoff ? { posted_at: { $lt: cutoff } } : {}) },
      {
        select: ["source_kind", "source_id"],
        take: null,
      },
    ),
    finance.listFinanceProblems(
      { ...filters, ...(cutoff ? { detected_at: { $lt: cutoff } } : {}) },
      {
        select: ["source_kind", "source_id"],
        take: null,
      },
    ),
  ])
  const accounted = new Set(
    [...receipts, ...problems].map(
      ({ source_kind, source_id }) => `${source_kind}:${source_id}`,
    ),
  )
  return recognitions.filter(
    ({ recognition: { source } }) =>
      !accounted.has(`${source.kind}:${source.id}`),
  )
}

/**
 * Every cancelled Order of a Restaurant, as the statement reads them to find
 * what is still owed processing.
 */
export async function restaurantCancellations(
  container: MedusaContainer,
  restaurant_id: string,
) {
  const records = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { restaurant_id, state: "cancelled" },
      { take: null, select: CANCELLED_FIELDS },
    )
  return cancelledOrdersOf(container, records as unknown as CancelledRecord[])
}
