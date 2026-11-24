import type { Context } from "@medusajs/framework/types"
import {
  BigNumber,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import FinanceReceipt, {
  type FinanceSourceKind,
} from "./models/finance-receipt"
import FinanceJournalEntry, {
  FOOD_CREDIT_FUNDING,
  type JournalEntryKind,
} from "./models/finance-journal-entry"
import FinanceProblem, {
  type FinanceProblemCode,
} from "./models/finance-problem"

export type RecognitionCommand = {
  receipt: {
    source_kind: FinanceSourceKind
    source_id: string
    restaurant_id: string
    order_id: string | null
    /** The qualifying outcome, as the source kind names it. */
    outcome: "delivered"
    occurred_at: Date
    original_month: string
    posted_at: Date
    posting_month: string
    terms_version: string
    currency_code: string
    evidence: Record<string, unknown>
    payload_digest: string
  }
  entry: {
    kind: JournalEntryKind
    /** Exact decimal strings in statement direction. */
    food_credit: string
    commission: string
    funded_by: (typeof FOOD_CREDIT_FUNDING)[number]
  }
}

export type RecognitionResult =
  | { outcome: "recognized" | "already_recognized"; receipt_id: string }
  | { outcome: "conflict"; receipt_id: string }

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
}) {
  /**
   * Records one source's receipt and journal entry in one transaction. A
   * repeat with the same payload returns the original receipt; another
   * payload for the same source is recorded as a conflict problem and books
   * nothing. The unique source identity in storage backs the caller's guard.
   */
  @InjectManager()
  @InjectTransactionManager()
  async recognizeSource(
    command: RecognitionCommand,
    @MedusaContext() context: Context = {},
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
    const created = await this.createFinanceReceipts(receipt, context)
    await this.createFinanceJournalEntries(
      {
        receipt_id: created.id,
        kind: entry.kind,
        restaurant_id: receipt.restaurant_id,
        order_id: receipt.order_id,
        occurred_at: receipt.occurred_at,
        original_month: receipt.original_month,
        posted_at: receipt.posted_at,
        posting_month: receipt.posting_month,
        currency_code: receipt.currency_code,
        // Exact decimals: the generated input type says `number`, but a
        // bigNumber property stores a BigNumber without float rounding.
        food_credit: new BigNumber(entry.food_credit) as unknown as number,
        commission: new BigNumber(entry.commission) as unknown as number,
        funded_by: entry.funded_by,
      },
      context,
    )
    return { outcome: "recognized", receipt_id: created.id }
  }

  /** Records an evidence problem once per source and code. */
  @InjectManager()
  @InjectTransactionManager()
  async recordProblem(
    problem: ProblemCommand,
    @MedusaContext() context: Context = {},
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
