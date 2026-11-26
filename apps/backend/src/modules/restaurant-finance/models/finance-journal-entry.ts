import { model } from "@medusajs/framework/utils"

/**
 * What kind of booked effect an entry is (#52): a delivered Order's food
 * credit and commission, or an existing prepared-food credit (#229),
 * MTOGO-funded with zero commission.
 */
export const JOURNAL_ENTRY_KINDS = [
  "delivered_order",
  "prepared_food_compensation",
  "service_fee_difference",
] as const
export type JournalEntryKind = (typeof JOURNAL_ENTRY_KINDS)[number]

/** Who funds an entry's food credit (ADR-0006, ADR-0010). */
export const FOOD_CREDIT_FUNDING = ["customer", "mtogo"] as const

/**
 * The append-only booked effect of one receipt (spec #52 §3), in the month it
 * was posted. Components stay separate and signed in statement direction:
 * `food_credit` is owed to the Restaurant and `commission` is charged to it,
 * so a later reversal is a negative commission referencing its original.
 * Monthly totals sum these booked amounts; they are never recomputed. Never
 * updated or deleted.
 */
const FinanceJournalEntry = model
  .define("finance_journal_entry", {
    id: model.id({ prefix: "fjrnl" }).primaryKey(),
    receipt_id: model.text(),
    kind: model.enum([...JOURNAL_ENTRY_KINDS]),
    restaurant_id: model.text(),
    order_id: model.text().nullable(),
    occurred_at: model.dateTime(),
    original_month: model.text(),
    posted_at: model.dateTime(),
    posting_month: model.text(),
    currency_code: model.text(),
    food_credit: model.bigNumber(),
    commission: model.bigNumber(),
    service_fee: model.bigNumber().default(0),
    funded_by: model.enum([...FOOD_CREDIT_FUNDING]),
  })
  .indexes([
    { on: ["receipt_id"], unique: true },
    // The statement's page of entries, newest posting first (#227).
    { on: ["restaurant_id", "posting_month", "posted_at", "id"] },
  ])

export default FinanceJournalEntry
