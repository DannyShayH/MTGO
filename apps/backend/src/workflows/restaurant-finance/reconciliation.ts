import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createLogRecord } from "@dtc/logging"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { recoverCancellations } from "./cancellation-recognition"
import type { CancellationRecognitionOutcome } from "./cancellation-recognition"
import { closeStatementsWorkflow } from "./closure"
import { unaccountedHandovers } from "./pending-handovers"
import {
  FINANCE_RECOVERY_PAGE_SIZE,
  reconcileLegacyBasisProblems,
  recognizeDeliveredOrder,
} from "./recognition"
import type { DeliveredRecognitionOutcome } from "./recognition"
import { sweepServiceFees } from "./service-fee-accrual"
import type { ServiceFeeAccrualOutcome } from "./service-fee-accrual"

/** How many owed sources of each kind one invocation handles. */
export const FINANCE_RECOVERY_BATCH_SIZE = 50
/** How many invocations one job tick runs before leaving the rest to the next. */
export const FINANCE_RECOVERY_MAX_RUNS = 10

export type ReconciliationInput = {
  /** Owed sources of each kind handled per invocation (default 50). */
  batch?: number
}

export type ReconciliationResult = {
  /** Delivered Orders, by Order id. */
  outcomes: Record<string, DeliveredRecognitionOutcome>
  /** Older `missing_financial_basis` problems re-examined (#231). */
  legacy: Record<string, DeliveredRecognitionOutcome>
  /** Cancelled Orders, by Order id (#229). */
  cancellations: Record<string, CancellationRecognitionOutcome>
  /** Current-month fee accruals, by Restaurant id (#228). */
  fees: Record<string, ServiceFeeAccrualOutcome>
  /**
   * A kind filled its batch and made progress, so more owed work may remain.
   * A finished invocation is never proof that the backlog is empty;
   * statement reads keep showing what is still owed.
   */
  backlog: boolean
}

/**
 * The authoritative handovers, oldest first and page by page, that finance
 * has not accounted for, recognized up to `batch`. Every page is read, so
 * an owed handover is found however many were recognized before it.
 */
async function recoverHandovers(container: MedusaContainer, batch: number) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const outcomes: Record<string, DeliveredRecognitionOutcome> = {}
  let remaining = batch
  let page = 0
  while (remaining > 0) {
    const handovers = await delivery.listIntendedDeliveries(
      { terminal_outcome: "delivered" },
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
    for (const order_id of owed) {
      if (remaining === 0) break
      const outcome = await recognizeDeliveredOrder(container, order_id)
      outcomes[order_id] = outcome
      // A handover without its Order operation records nothing, so it is
      // found again on every run; it must not use up the batch ahead of
      // owed handovers behind it.
      if (outcome !== "not_owed") remaining -= 1
    }
    if (handovers.length < FINANCE_RECOVERY_PAGE_SIZE) break
    page += 1
  }
  return outcomes
}

/**
 * The one finance reconciliation (spec #52 §9, #234): materializes ended
 * months, recognizes owed handovers, re-examines legacy problems, accounts
 * for cancellations and accrues the current month's fees, each kind with its
 * own bounded batch read from durable records only. It remembers nothing
 * between invocations, so a fresh process resumes where the last stopped,
 * and its first run after a restart is the startup reconciliation.
 *
 * The parts are independent: one failing never skips the others, and the
 * first failure is rethrown afterwards so it is still reported. Source
 * uniqueness, local transactions and the per-Restaurant finance guard make
 * two concurrent invocations, a replayed operational callback and a close
 * racing a posting safe. It runs whatever the `restaurant_statements` flag
 * says (ADR-0022).
 */
const reconcileRestaurantFinanceStep = createStep(
  "reconcile-restaurant-finance",
  async (input: ReconciliationInput, { container }) => {
    const batch = input.batch ?? FINANCE_RECOVERY_BATCH_SIZE
    const failures: unknown[] = []
    const attempt = async <T>(run: () => Promise<T>, fallback: T) => {
      try {
        return await run()
      } catch (error) {
        // The first failure is rethrown below and reported by the job
        // runner; only the later ones are logged here, so each is logged once.
        if (failures.length) {
          const record = createLogRecord("backend", "request.failed", {
            err: error,
          })
          container
            .resolve(ContainerRegistrationKeys.LOGGER)
            .log(record.level, record.msg, record)
        }
        failures.push(error)
        return fallback
      }
    }
    // Ended months are materialized first. Each posting also closes its own
    // Restaurant's ended months under the finance guard before it posts, so
    // a failed sweep here never lets old work post into an ended month.
    await attempt(
      () => closeStatementsWorkflow(container).run({ input: {} }),
      undefined,
    )
    const outcomes = await attempt(() => recoverHandovers(container, batch), {})
    const legacy = await attempt(
      () => reconcileLegacyBasisProblems(container, batch),
      {},
    )
    const cancellations = await attempt(
      () => recoverCancellations(container, batch),
      {},
    )
    const fees = await attempt(() => sweepServiceFees(container, batch), {})
    if (failures.length) throw failures[0]
    const result: ReconciliationResult = {
      outcomes,
      legacy,
      cancellations,
      fees,
      backlog: [outcomes, legacy, cancellations, fees].some((handled) => {
        // `not_owed` records nothing, so it neither fills a batch nor counts
        // as progress. A batch of failed attempts is not progress either:
        // another run in the same tick would only retry the same sources.
        const results = Object.values(handled).filter(
          (outcome) => outcome !== "not_owed",
        )
        return (
          results.length >= batch &&
          results.some((outcome) => outcome !== "pending")
        )
      }),
    }
    return new StepResponse(result)
  },
)

export const recoverRestaurantFinanceWorkflow = createWorkflow(
  "recover-restaurant-finance",
  function (input: ReconciliationInput) {
    return new WorkflowResponse(reconcileRestaurantFinanceStep(input))
  },
)

/**
 * Runs fresh reconciliations until one reports no backlog, at most
 * `maxRuns` of them, so a backlog larger than one batch drains within a
 * tick while a tick stays bounded. Anything left waits for the next tick.
 */
export async function drainRestaurantFinance(
  container: MedusaContainer,
  {
    batch,
    maxRuns = FINANCE_RECOVERY_MAX_RUNS,
  }: { batch?: number; maxRuns?: number } = {},
) {
  let runs = 0
  let backlog = true
  while (backlog && runs < maxRuns) {
    const { result } = await recoverRestaurantFinanceWorkflow(container).run({
      input: { batch },
    })
    runs += 1
    backlog = result.backlog
  }
  return { runs, backlog }
}
