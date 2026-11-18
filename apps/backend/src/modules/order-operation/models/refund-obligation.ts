import { model } from "@medusajs/framework/utils"

export const REFUND_OUTCOMES = ["pending", "failed", "succeeded"] as const
export type RefundOutcome = (typeof REFUND_OUTCOMES)[number]

/**
 * The full refund a pre-acceptance cancellation owes the Customer (#143). It
 * is committed with the cancellation, before the provider is contacted, and
 * never depends on the provider's refund row, which a failure soft-deletes.
 * One per Order: a repeated cancellation never owes a second refund. Every
 * attempt reuses `idempotency_key`, so the provider moves the money once.
 */
const RefundObligation = model
  .define("refund_obligation", {
    id: model.id({ prefix: "refob" }).primaryKey(),
    order_id: model.text(),
    payment_id: model.text(),
    /** Captured minus already refunded at cancellation, incl. VAT, in Medusa's monetary units. */
    amount: model.bigNumber(),
    currency_code: model.text(),
    idempotency_key: model.text(),
    status: model.enum([...REFUND_OUTCOMES]).default("pending"),
    attempt_count: model.number().default(0),
    last_attempted_at: model.dateTime().nullable(),
    /** A safe classification of the last failure, never a provider message. */
    failure_code: model.text().nullable(),
    /** The provider refund verified as succeeded, and when. */
    refund_id: model.text().nullable(),
    succeeded_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["idempotency_key"], unique: true },
    { on: ["status"] },
  ])

export default RefundObligation
