import type { Context } from "@medusajs/framework/types"
import {
  BigNumber,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from "@medusajs/framework/utils"
import FinanceReceipt, {
  type FinanceSourceKind,
} from "./models/finance-receipt"
import FinanceJournalEntry, {
  FOOD_CREDIT_FUNDING,
  type JournalEntryKind,
} from "./models/finance-journal-entry"
import FinanceClosure from "./models/finance-closure"
import FinanceServiceFee from "./models/finance-service-fee"
import FinanceProblem, {
  type FinanceProblemCode,
} from "./models/finance-problem"

/** The authoritative server clock, classified inside the local commit. */
const postingTime = () => {
  const posted_at = new Date()
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(posted_at)
  return {
    posted_at,
    posting_month: `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`,
  }
}

export type RecognitionCommand = {
  receipt: {
    source_kind: FinanceSourceKind
    source_id: string
    restaurant_id: string
    order_id: string | null
    /** The qualifying outcome: `delivered` or the cancellation category. */
    outcome: string
    occurred_at: Date
    original_month: string
    posted_at: Date
    posting_month: string
    terms_version: string
    currency_code: string
    evidence: Record<string, unknown>
    payload_digest: string
  }
  /** The booked effect, or null for an outcome with no entitlement. */
  entry: {
    kind: JournalEntryKind
    /** Exact decimal strings in statement direction. */
    food_credit: string
    commission: string
    service_fee?: string
    funded_by: (typeof FOOD_CREDIT_FUNDING)[number]
  } | null
}

export type RecognitionResult =
  | { outcome: "recognized" | "already_recognized"; receipt_id: string }
  | { outcome: "conflict"; receipt_id: string }

export type ServiceFeeAccrual = {
  restaurant_id: string
  month: string
  terms_version: string
  currency_code: string
  /** Exact decimal strings. */
  policy_amount: string
  amount: string
  month_day_count: number
  active_dates: string[]
  accrued_at: Date
}

export type ServiceFeeAccrualResult = {
  outcome: "accrued" | "unchanged"
  service_fee_id: string
}

export type ProblemCommand = {
  source_kind: FinanceSourceKind
  source_id: string
  restaurant_id: string
  order_id: string | null
  code: FinanceProblemCode
  original_month: string
  detected_at: Date
}

/**
 * The Restaurant finance module (spec #52 §1, §3). Receipts and journal
 * entries are only ever created, together; nothing here updates or deletes
 * a booked amount. Workflows decide what is recognized and when; this
 * service keeps each recognition atomic and unique per source.
 */
class RestaurantFinanceModuleService extends MedusaService({
  FinanceReceipt,
  FinanceJournalEntry,
  FinanceProblem,
  FinanceServiceFee,
  FinanceClosure,
}) {
  /**
   * Records one source's receipt and journal entry in one transaction (only
   * the receipt for an outcome with no entitlement). A
   * repeat with the same payload returns the original receipt; another
   * payload for the same source is recorded as a conflict problem and books
   * nothing. The unique source identity in storage backs the caller's guard.
   */
  @InjectManager()
  @InjectTransactionManager()
  async recognizeSource(
    command: RecognitionCommand,
    @MedusaContext() context?: Context,
  ): Promise<RecognitionResult> {
    const { receipt, entry } = command
    const [existing] = await this.listFinanceReceipts(
      { source_kind: receipt.source_kind, source_id: receipt.source_id },
      { take: 1, select: ["id", "payload_digest"] },
      context,
    )
    if (existing) {
      if (existing.payload_digest === receipt.payload_digest)
        return { outcome: "already_recognized", receipt_id: existing.id }
      await this.recordProblem(
        {
          source_kind: receipt.source_kind,
          source_id: receipt.source_id,
          restaurant_id: receipt.restaurant_id,
          order_id: receipt.order_id,
          code: "conflicting_recognition",
          original_month: receipt.original_month,
          detected_at: receipt.posted_at,
        },
        context,
      )
      return { outcome: "conflict", receipt_id: existing.id }
    }
    // Choose the actual posting instant after transaction/guard waits and
    // receipt lookup. A caller's earlier clock cannot reopen a past month.
    const posted = { ...receipt, ...postingTime() }
    const created = await this.createFinanceReceipts(posted, context)
    if (!entry) return { outcome: "recognized", receipt_id: created.id }
    await this.createFinanceJournalEntries(
      {
        receipt_id: created.id,
        kind: entry.kind,
        restaurant_id: receipt.restaurant_id,
        order_id: receipt.order_id,
        occurred_at: receipt.occurred_at,
        original_month: receipt.original_month,
        posted_at: posted.posted_at,
        posting_month: posted.posting_month,
        currency_code: receipt.currency_code,
        // Exact decimals: the generated input type says `number`, but a
        // bigNumber property stores a BigNumber without float rounding.
        food_credit: new BigNumber(entry.food_credit) as unknown as number,
        commission: new BigNumber(entry.commission) as unknown as number,
        service_fee: new BigNumber(
          entry.service_fee ?? "0",
        ) as unknown as number,
        funded_by: entry.funded_by,
      },
      context,
    )
    return { outcome: "recognized", receipt_id: created.id }
  }

  /**
   * Accrues the month's one service-fee obligation (#228): creates it, or
   * replaces its active dates and amount when they changed. The same dates
   * again change nothing. The workflow decides that the month is still
   * current, under the Restaurant's finance guard; the unique Restaurant
   * and month in storage keep it one obligation.
   */
  @InjectManager()
  @InjectTransactionManager()
  async accrueServiceFee(
    accrual: ServiceFeeAccrual,
    @MedusaContext() context?: Context,
  ): Promise<ServiceFeeAccrualResult> {
    const [existing] = await this.listFinanceServiceFees(
      { restaurant_id: accrual.restaurant_id, month: accrual.month },
      { take: 1, select: ["id", "active_dates"] },
      context,
    )
    if (accrual.month !== postingTime().posting_month)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "service_fee_month_closed",
      )
    // Exact decimals: a bigNumber property stores a BigNumber unrounded.
    const amounts = {
      policy_amount: new BigNumber(accrual.policy_amount) as unknown as number,
      amount: new BigNumber(accrual.amount) as unknown as number,
    }
    const obligation = {
      ...accrual,
      ...amounts,
      // A json property stores the date list as it is.
      active_dates: accrual.active_dates as unknown as Record<string, unknown>,
      active_date_count: accrual.active_dates.length,
    }
    if (!existing) {
      const created = await this.createFinanceServiceFees(obligation, context)
      return { outcome: "accrued", service_fee_id: created.id }
    }
    if (
      JSON.stringify(existing.active_dates) ===
      JSON.stringify(accrual.active_dates)
    )
      return { outcome: "unchanged", service_fee_id: existing.id }
    await this.updateFinanceServiceFees(
      { id: existing.id, ...obligation },
      context,
    )
    return { outcome: "accrued", service_fee_id: existing.id }
  }

  /** Materializes a closure once under the shared Restaurant finance guard. */
  @InjectManager()
  @InjectTransactionManager()
  async closeStatement(
    closure: {
      restaurant_id: string
      month: string
      starts_at: Date
      ends_at: Date
      snapshot: Record<string, unknown>
    },
    @MedusaContext() context?: Context,
  ): Promise<void> {
    const [existing] = await this.listFinanceClosures(
      { restaurant_id: closure.restaurant_id, month: closure.month },
      { select: ["id"], take: 1 },
      context,
    )
    if (!existing) await this.createFinanceClosures(closure, context)
  }

  /** Records an evidence problem once per source and code. */
  @InjectManager()
  @InjectTransactionManager()
  async recordProblem(
    problem: ProblemCommand,
    @MedusaContext() context?: Context,
  ): Promise<void> {
    const [existing] = await this.listFinanceProblems(
      {
        source_kind: problem.source_kind,
        source_id: problem.source_id,
        code: problem.code,
      },
      { take: 1, select: ["id"] },
      context,
    )
    if (!existing) await this.createFinanceProblems(problem, context)
  }
}

export default RestaurantFinanceModuleService
