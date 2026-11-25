import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { CancellationCategory } from "../../modules/order-operation/models/order-operation"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { financialBasisView } from "../order-operations/financial-basis"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  exactAmount,
  payloadDigest,
} from "./calculation"
import {
  cancellationRecognition,
  type CancellationFacts,
  type CancellationRecognition,
  recoverableIn,
} from "./cancellation-rules"
import { restaurantFinanceLock } from "./locks"

/**
 * Finance's recognition of cancelled Orders (#229; spec #52 §3, §4, §9).
 * An existing prepared-food credit is recognized once, referencing it, with
 * MTOGO funding and zero commission; every other supported cancellation is
 * recorded as processed with no entitlement. Neither depends on the
 * Customer's refund: a pending, failed or retried refund leaves the one
 * recognition as it is.
 */

type CancelledRecord = {
  order_id: string
  restaurant_id: string
  cancellation_category: CancellationCategory | null
  cancelled_at: Date | string | null
  acceptance_deadline: Date | string | null
}

const CANCELLED_FIELDS = [
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
    finance.listFinanceReceipts(filters, {
      select: ["source_kind", "source_id"],
      take: null,
    }),
    finance.listFinanceProblems(filters, {
      select: ["source_kind", "source_id"],
      take: null,
    }),
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

export type CancellationRecognitionOutcome =
  | "recognized"
  | "already_recognized"
  | "conflict"
  | "missing_outcome_evidence"
  /** Compensation of an ended month, left owed for the closing slice. */
  | "deferred"
  | "not_owed"
  | "pending"

/** The receipt's terms: the purchase's preserved terms, if any. */
async function termsVersionOf(container: MedusaContainer, order_id: string) {
  const [operation] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id },
      { take: 1, select: ["restaurant_id", "placed_at", "financial_basis"] },
    )
  const basis = operation
    ? financialBasisView(operation.financial_basis, operation)
    : { status: "unavailable" as const }
  return basis.status === "preserved" ? basis.terms.terms_version : "unrecorded"
}

const entryOf = (recognition: CancellationRecognition) =>
  recognition.status === "compensation"
    ? {
        kind: "prepared_food_compensation" as const,
        food_credit: recognition.food_credit,
        commission: recognition.commission,
        funded_by: recognition.funded_by,
      }
    : null

/**
 * Recognizes one cancelled Order (#229) under the Restaurant's finance
 * guard, with the posting month decided by the server clock inside it.
 * The original date is the qualifying moment (the claim deadline of an
 * unassigned timeout), kept apart from the actual posting time. Unrecognized
 * compensation of an ended month is left owed rather than backdated or
 * slipped into a closed period; an outcome with no entitlement books nothing
 * and is recorded whenever it is processed. Facts that do not establish the
 * outcome are recorded as an evidence problem, never inferred.
 *
 * Owed work after a committed cancellation (ADR-0021): it never fails or
 * undoes the cancellation. A failure is logged and stays owed in the
 * durable records for `recoverRestaurantFinanceWorkflow`.
 */
export async function recognizeCancelledOrder(
  container: MedusaContainer,
  order_id: string,
): Promise<CancellationRecognitionOutcome> {
  try {
    const records = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id, state: "cancelled" },
        { take: 1, select: CANCELLED_FIELDS },
      )
    const [order] = await cancelledOrdersOf(
      container,
      records as unknown as CancelledRecord[],
    )
    if (!order) return "not_owed"
    const recognition = cancellationRecognition(order)
    const original_month = copenhagenMonthOf(recognition.occurred_at)
    const terms_version = await termsVersionOf(container, order_id)
    const finance = container.resolve<RestaurantFinanceModuleService>(
      RESTAURANT_FINANCE_MODULE,
    )
    const lock = restaurantFinanceLock(order.restaurant_id)
    return await container.resolve(Modules.LOCKING).execute(
      lock.key,
      async (): Promise<CancellationRecognitionOutcome> => {
        const posted_at = new Date()
        const posting_month = copenhagenMonthOf(posted_at)
        const source = recognition.source
        if (recognition.status === "evidence_missing") {
          await finance.recordProblem({
            source_kind: source.kind,
            source_id: source.id,
            restaurant_id: order.restaurant_id,
            order_id,
            code: "missing_outcome_evidence",
            original_month,
            detected_at: posted_at,
          })
          return "missing_outcome_evidence"
        }
        const [existing] = await finance.listFinanceReceipts(
          { source_kind: source.kind, source_id: source.id },
          { take: 1, select: ["id"] },
        )
        if (
          !existing &&
          recognition.status === "compensation" &&
          original_month !== posting_month
        )
          return "deferred"
        const entry = entryOf(recognition)
        const currency_code =
          recognition.status === "compensation"
            ? recognition.currency_code
            : "dkk"
        const result = await finance.recognizeSource({
          receipt: {
            source_kind: source.kind,
            source_id: source.id,
            restaurant_id: order.restaurant_id,
            order_id,
            outcome: recognition.outcome,
            occurred_at: recognition.occurred_at,
            original_month,
            posted_at,
            posting_month,
            terms_version,
            currency_code,
            evidence: recognition.evidence,
            payload_digest: payloadDigest({
              restaurant_id: order.restaurant_id,
              order_id,
              outcome: recognition.outcome,
              occurred_at: recognition.occurred_at.toISOString(),
              currency_code,
              entry,
              evidence: recognition.evidence,
            }),
          },
          entry,
        })
        return result.outcome
      },
      { timeout: lock.timeout, expire: lock.ttl },
    )
  } catch (error) {
    logRecoveryFailure(container, order_id, error)
    return "pending"
  }
}

/** How many cancellations the recovery sweep reads per page of the month. */
const CANCELLATION_PAGE_SIZE = 200

/**
 * Recovers up to `limit` cancellations that finance never accounted for
 * (spec #52 §9), reading every page so an owed one is found however many
 * came before it. Returns each outcome by Order.
 *
 * It reads from the start of the previous month, so an outcome with no
 * entitlement whose processing failed just before midnight on the last day
 * is still recorded after the month turns, instead of leaving that month
 * pending for good. Compensation whose month has ended cannot be posted
 * (it waits for the closing work), so it is skipped rather than retried on
 * every tick, where it would use up the batch.
 */
export async function recoverCancellations(
  container: MedusaContainer,
  limit: number,
) {
  const posting_month = copenhagenMonthOf(new Date())
  const current = copenhagenMonthPeriod(posting_month)
  const { starts_at } = copenhagenMonthPeriod(
    copenhagenMonthOf(new Date(current.starts_at.getTime() - 1)),
  )
  const operations = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const outcomes: Record<string, CancellationRecognitionOutcome> = {}
  let remaining = limit
  let page = 0
  while (remaining > 0) {
    const records = await operations.listOrderOperations(
      { state: "cancelled", cancelled_at: { $gte: starts_at } },
      {
        skip: page * CANCELLATION_PAGE_SIZE,
        take: CANCELLATION_PAGE_SIZE,
        select: CANCELLED_FIELDS,
        order: { cancelled_at: "ASC", id: "ASC" },
      },
    )
    const owed = (
      await unaccountedCancellations(
        container,
        await cancelledOrdersOf(
          container,
          records as unknown as CancelledRecord[],
        ),
      )
    ).filter(({ recognition }) =>
      recoverableIn(
        recognition,
        copenhagenMonthOf(recognition.occurred_at),
        posting_month,
      ),
    )
    for (const { order } of owed.slice(0, remaining))
      outcomes[order.order_id] = await recognizeCancelledOrder(
        container,
        order.order_id,
      )
    remaining -= Math.min(owed.length, remaining)
    if (records.length < CANCELLATION_PAGE_SIZE) break
    page += 1
  }
  return outcomes
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
