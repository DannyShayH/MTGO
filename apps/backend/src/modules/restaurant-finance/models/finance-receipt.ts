import { model } from "@medusajs/framework/utils"

/** The authoritative sources a receipt can recognize; later kinds join (#52). */
export const FINANCE_SOURCE_KINDS = ["order_delivered"] as const
export type FinanceSourceKind = (typeof FINANCE_SOURCE_KINDS)[number]

/**
 * One durable recognition per source entitlement (spec #52 §3): the source,
 * its Restaurant and Order, the qualifying outcome and its original time and
 * Copenhagen month, the actual posting time and month, and the exact
 * calculation inputs and policy evidence. Unique per source, so a replay can
 * never recognize the same entitlement twice. `payload_digest` identifies
 * what was recognized; a later attempt with another payload is a conflict,
 * never an overwrite. Created only, together with its journal entry.
 */
const FinanceReceipt = model
  .define("finance_receipt", {
    id: model.id({ prefix: "frcpt" }).primaryKey(),
    source_kind: model.enum([...FINANCE_SOURCE_KINDS]),
    source_id: model.text(),
    restaurant_id: model.text(),
    order_id: model.text().nullable(),
    outcome: model.text(),
    occurred_at: model.dateTime(),
    original_month: model.text(),
    posted_at: model.dateTime(),
    posting_month: model.text(),
    terms_version: model.text(),
    currency_code: model.text(),
    /** Exact inputs: purchased lines, VAT rate, tiers and food values. */
    evidence: model.json(),
    payload_digest: model.text(),
  })
  .indexes([
    { on: ["source_kind", "source_id"], unique: true },
    { on: ["restaurant_id", "original_month"] },
    { on: ["order_id"] },
  ])

export default FinanceReceipt
