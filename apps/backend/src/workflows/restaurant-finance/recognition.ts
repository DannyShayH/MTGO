import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  deliveredRecognition,
  payloadDigest,
} from "./calculation"
import { recoverCancellations } from "./cancellation-recognition"
import { restaurantFinanceLock } from "./locks"

/** How many handovers the recovery sweep reads per page of the month. */
export const FINANCE_RECOVERY_PAGE_SIZE = 200
/** How many owed recognitions one sweep performs; the rest wait a tick. */
export const FINANCE_RECOVERY_BATCH_SIZE = 50

/**
 * The delivered Orders among `order_ids` that finance has not accounted
 * for: neither recognized nor recorded as an evidence problem.
 */
export async function unaccountedHandovers(
  container: MedusaContainer,
  order_ids: string[],
) {
  if (!order_ids.length) return []
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const filters = {
    source_kind: "order_delivered" as const,
    source_id: order_ids,
  }
  const [receipts, problems] = await Promise.all([
    finance.listFinanceReceipts(filters, { select: ["source_id"], take: null }),
    finance.listFinanceProblems(filters, { select: ["source_id"], take: null }),
  ])
  const accounted = new Set(
    [...receipts, ...problems].map(({ source_id }) => source_id),
  )
  return order_ids.filter((id) => !accounted.has(id))
}

export type DeliveredRecognitionOutcome =
  | "recognized"
  | "already_recognized"
  | "conflict"
  | "missing_financial_basis"
  /** Its handover month is no longer the posting month (closing slice). */
  | "deferred"
  | "not_owed"
  | "pending"

/**
 * Recognizes one successfully delivered Order (#227; spec #52 §3, §4): one
 * receipt and journal entry with the full purchased food value excluding VAT
 * as food credit and the marginal commission, dated by the authoritative
 * handover in the delivery record, never by a later kitchen or native
 * synchronization.
 *
 * The posting month is decided by the server clock inside the Restaurant's
 * finance guard. A handover from a month that has already ended is left
 * owed for the later closing and adjustment work rather than backdated.
 * An Order without a preserved purchase basis is recorded as an evidence
 * problem, so it is visible and not retried forever.
 *
 * Owed work after a committed handover (ADR-0021): it has no compensation
 * and never fails the handover. A failure is logged and stays owed in the
 * durable records, and `recoverRestaurantFinanceWorkflow` retries it.
 */
export async function recognizeDeliveredOrder(
  container: MedusaContainer,
  order_id: string,
): Promise<DeliveredRecognitionOutcome> {
  try {
    const [delivery] = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { order_id, terminal_outcome: "delivered" },
        { take: 1, select: ["terminal_at"] },
      )
    const [operation] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id },
        {
          take: 1,
          select: ["restaurant_id", "placed_at", "financial_basis"],
        },
      )
    if (!delivery?.terminal_at || !operation) return "not_owed"
    const occurred_at = new Date(delivery.terminal_at)
    const original_month = copenhagenMonthOf(occurred_at)
    const finance = container.resolve<RestaurantFinanceModuleService>(
      RESTAURANT_FINANCE_MODULE,
    )
    const recognition = deliveredRecognition(
      operation.financial_basis,
      operation,
    )
    const lock = restaurantFinanceLock(operation.restaurant_id)
    return await container.resolve(Modules.LOCKING).execute(
      lock.key,
      async (): Promise<DeliveredRecognitionOutcome> => {
        const posted_at = new Date()
        const posting_month = copenhagenMonthOf(posted_at)
        if (recognition.status === "missing_financial_basis") {
          await finance.recordProblem({
            source_kind: "order_delivered",
            source_id: order_id,
            restaurant_id: operation.restaurant_id,
            order_id,
            code: "missing_financial_basis",
            original_month,
            detected_at: posted_at,
          })
          return "missing_financial_basis"
        }
        const payload = {
          restaurant_id: operation.restaurant_id,
          order_id,
          outcome: "delivered",
          occurred_at: occurred_at.toISOString(),
          currency_code: recognition.currency_code,
          food_credit: recognition.food_credit,
          commission: recognition.commission,
          evidence: recognition.evidence,
        }
        const [existing] = await finance.listFinanceReceipts(
          { source_kind: "order_delivered", source_id: order_id },
          { take: 1, select: ["id"] },
        )
        // An unrecognized handover from an ended month is not backdated.
        if (!existing && original_month !== posting_month) return "deferred"
        const result = await finance.recognizeSource({
          receipt: {
            source_kind: "order_delivered",
            source_id: order_id,
            restaurant_id: operation.restaurant_id,
            order_id,
            outcome: "delivered",
            occurred_at,
            original_month,
            posted_at,
            posting_month,
            terms_version: recognition.evidence.terms_version,
            currency_code: recognition.currency_code,
            evidence: recognition.evidence,
            payload_digest: payloadDigest(payload),
          },
          entry: {
            kind: "delivered_order",
            food_credit: recognition.food_credit,
            commission: recognition.commission,
            funded_by: "customer",
          },
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

/**
 * Recognizes the handover right after it committed and the Order recorded
 * it. Owed work with no compensation (ADR-0021); see
 * `recognizeDeliveredOrder`.
 */
export const recognizeDeliveredOrderStep = createStep(
  "recognize-delivered-order",
  async (input: { order_id: string }, { container }) => {
    await recognizeDeliveredOrder(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * One recovery sweep (spec #52 §9): reads the current month's authoritative
 * handovers page by page, oldest first, and recognizes up to a batch of those
 * neither recognized nor recorded as an evidence problem. Every page is read,
 * so an owed handover is found however many were recognized before it; the
 * batch bounds one tick's work and the next tick resumes from durable state.
 * Cancellations (#229) are recovered the same way, with their own batch,
 * from the start of the previous month (see `recoverCancellations`). Its first tick after a restart is the startup reconciliation; the source
 * uniqueness and the finance guard make two sweeps, a retried handover and a
 * sweep safe together.
 */
const recoverRestaurantFinanceStep = createStep(
  "recover-restaurant-finance",
  async (_input: Record<string, never>, { container }) => {
    const { starts_at } = copenhagenMonthPeriod(copenhagenMonthOf(new Date()))
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const outcomes: Record<string, DeliveredRecognitionOutcome> = {}
    let remaining = FINANCE_RECOVERY_BATCH_SIZE
    let page = 0
    while (remaining > 0) {
      const handovers = await delivery.listIntendedDeliveries(
        { terminal_outcome: "delivered", terminal_at: { $gte: starts_at } },
        {
          skip: page * FINANCE_RECOVERY_PAGE_SIZE,
          take: FINANCE_RECOVERY_PAGE_SIZE,
          select: ["order_id"],
          order: { terminal_at: "ASC", id: "ASC" },
        },
      )
      const owed = await unaccountedHandovers(
        container,
        handovers.map(({ order_id }) => order_id),
      )
      for (const order_id of owed.slice(0, remaining))
        outcomes[order_id] = await recognizeDeliveredOrder(container, order_id)
      remaining -= Math.min(owed.length, remaining)
      if (handovers.length < FINANCE_RECOVERY_PAGE_SIZE) break
      page += 1
    }
    // Cancellations (#229) have their own batch, so neither starves the other.
    const cancellations = await recoverCancellations(
      container,
      FINANCE_RECOVERY_BATCH_SIZE,
    )
    return new StepResponse({ outcomes, cancellations })
  },
)

export const recoverRestaurantFinanceWorkflow = createWorkflow(
  "recover-restaurant-finance",
  function (input: Record<string, never>) {
    return new WorkflowResponse(recoverRestaurantFinanceStep(input))
  },
)
