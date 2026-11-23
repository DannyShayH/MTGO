import { model } from "@medusajs/framework/utils"

export const REFUND_ATTEMPT_OUTCOMES = [
  "succeeded",
  "failed",
  "in_progress",
] as const
export type RefundAttemptOutcome = (typeof REFUND_ATTEMPT_OUTCOMES)[number]

/**
 * One real attempt at an Order's owed full refund (#197), only ever added
 * to: nothing updates or deletes an entry. It outlives the provider's refund
 * row, which a failure soft-deletes, so a failed attempt stays explainable.
 * `attempted_by` is whoever triggered it (an operator, staff or Customer id)
 * or `system`; `failure_code` is the safe class of a failed attempt, never a
 * provider message.
 */
const RefundAttempt = model
  .define("refund_attempt", {
    id: model.id({ prefix: "refat" }).primaryKey(),
    refund_obligation_id: model.text(),
    order_id: model.text(),
    attempted_at: model.dateTime(),
    attempted_by: model.text(),
    outcome: model.enum([...REFUND_ATTEMPT_OUTCOMES]),
    failure_code: model.text().nullable(),
  })
  .indexes([
    { on: ["refund_obligation_id", "attempted_at"] },
    { on: ["order_id", "attempted_at"] },
  ])

export default RefundAttempt
