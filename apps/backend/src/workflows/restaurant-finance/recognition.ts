import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
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
  deliveredRecognition,
  payloadDigest,
} from "./calculation"
import { readLegacyBasis } from "./legacy-sources"
import type { LegacyEvidence } from "./legacy-basis"
import type { FinanceProblemCode } from "../../modules/restaurant-finance/models/finance-problem"
import { closeRestaurantStatements } from "./closure"
import { restaurantFinanceLock } from "./locks"

/** How many handovers the recovery sweep reads per page of the month. */
export const FINANCE_RECOVERY_PAGE_SIZE = 200

export type DeliveredRecognitionOutcome =
  | "recognized"
  | "already_recognized"
  | "conflict"
  | "missing_financial_basis"
  | "not_owed"
  | "pending"

const MISSING_EVIDENCE_CODE: Record<LegacyEvidence, FinanceProblemCode> = {
  purchase: "missing_purchase_evidence",
  terms: "missing_terms_evidence",
}

/**
 * What a handover earns from its preserved basis or, for an Order placed
 * before the basis was preserved, from a legacy reconstruction (#231) whose
 * evidence says so. Otherwise the facts that could not be verified.
 */
async function resolveDeliveredRecognition(
  container: MedusaContainer,
  order_id: string,
  operation: {
    restaurant_id: string
    placed_at: Date | string | null
    financial_basis: unknown
  },
): Promise<{
  recognition: ReturnType<typeof deliveredRecognition>
  missing: LegacyEvidence[]
}> {
  const preserved = deliveredRecognition(operation.financial_basis, operation)
  if (preserved.status === "recognizable")
    return { recognition: preserved, missing: [] }
  // A basis preserved at placement but unreadable is reported, never
  // silently replaced by a reconstruction.
  if (operation.financial_basis != null)
    return { recognition: preserved, missing: ["purchase"] }
  const legacy = await readLegacyBasis(container, order_id, operation)
  if (legacy.status === "unverifiable")
    return { recognition: preserved, missing: legacy.missing }
  const rebuilt = deliveredRecognition(legacy.basis, {
    restaurant_id: operation.restaurant_id,
    placed_at: legacy.placed_at,
  })
  if (rebuilt.status !== "recognizable")
    return { recognition: rebuilt, missing: ["purchase"] }
  return {
    recognition: {
      ...rebuilt,
      evidence: {
        ...rebuilt.evidence,
        reconstruction: {
          source: "legacy_reconciliation",
          placed_at: legacy.placed_at,
          placement_time_source: legacy.placement_time_source,
        },
      },
    },
    missing: [],
  }
}

/**
 * Recognizes one successfully delivered Order (#227; spec #52 §3, §4): one
 * receipt and journal entry with the full purchased food value excluding VAT
 * as food credit and the marginal commission, dated by the authoritative
 * handover in the delivery record, never by a later kitchen or native
 * synchronization.
 *
 * The posting month is decided by the server clock inside the Restaurant's
 * finance guard and local transaction. An older handover is recovered once
 * as a linked adjustment in the current month.
 * An Order without a preserved purchase basis is reconstructed only from
 * verifiable legacy facts (#231); otherwise each unverifiable fact is
 * recorded as an evidence problem, so it is visible and not retried forever.
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
    await closeRestaurantStatements(container, operation.restaurant_id)
    const { recognition, missing } = await resolveDeliveredRecognition(
      container,
      order_id,
      operation,
    )
    const lock = restaurantFinanceLock(operation.restaurant_id)
    return await container.resolve(Modules.LOCKING).execute(
      lock.key,
      async (): Promise<DeliveredRecognitionOutcome> => {
        const posted_at = new Date()
        const posting_month = copenhagenMonthOf(posted_at)
        if (recognition.status === "missing_financial_basis") {
          for (const fact of missing)
            await finance.recordProblem({
              source_kind: "order_delivered",
              source_id: order_id,
              restaurant_id: operation.restaurant_id,
              order_id,
              code: MISSING_EVIDENCE_CODE[fact],
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
 * Legacy reconciliation (#231): every handover recorded as
 * `missing_financial_basis` before reconciliation existed is re-examined
 * once, page by page with its own batch. A verifiable basis is recognized
 * with its real handover date, as a linked adjustment when its month has
 * closed; otherwise the specific missing facts are recorded, which ends the
 * re-examination, so an unverifiable source is not retried every minute.
 */
export async function reconcileLegacyBasisProblems(
  container: MedusaContainer,
  batch: number,
) {
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const outcomes: Record<string, DeliveredRecognitionOutcome> = {}
  let remaining = batch
  let page = 0
  while (remaining > 0) {
    const recorded = await finance.listFinanceProblems(
      { source_kind: "order_delivered", code: "missing_financial_basis" },
      {
        skip: page * FINANCE_RECOVERY_PAGE_SIZE,
        take: FINANCE_RECOVERY_PAGE_SIZE,
        select: ["source_id"],
        order: { detected_at: "ASC", id: "ASC" },
      },
    )
    const ids = recorded.map(({ source_id }) => source_id)
    const [receipts, reconciled] = ids.length
      ? await Promise.all([
          finance.listFinanceReceipts(
            { source_kind: "order_delivered", source_id: ids },
            { select: ["source_id"], take: null },
          ),
          finance.listFinanceProblems(
            {
              source_kind: "order_delivered",
              source_id: ids,
              code: ["missing_purchase_evidence", "missing_terms_evidence"],
            },
            { select: ["source_id"], take: null },
          ),
        ])
      : [[], []]
    const done = new Set(
      [...receipts, ...reconciled].map(({ source_id }) => source_id),
    )
    const owed = ids.filter((id) => !done.has(id)).slice(0, remaining)
    for (const order_id of owed)
      outcomes[order_id] = await recognizeDeliveredOrder(container, order_id)
    remaining -= owed.length
    if (recorded.length < FINANCE_RECOVERY_PAGE_SIZE) break
    page += 1
  }
  return outcomes
}
