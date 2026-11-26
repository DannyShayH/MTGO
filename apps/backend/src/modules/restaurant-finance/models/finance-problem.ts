import { model } from "@medusajs/framework/utils"
import { FINANCE_SOURCE_KINDS } from "./finance-receipt"

/**
 * Why a source cannot be recognized as it is (spec #52 §3, §8): its purchase
 * basis was never preserved, a repeated recognition carried another payload
 * than the one already booked, or a cancellation's recorded facts do not
 * establish its outcome or prepared-food credit (#229). Since legacy
 * reconciliation (#231), a delivered Order without a preserved basis names
 * which fact could not be verified: what was purchased, or the terms in
 * force at placement. `missing_financial_basis` remains for problems recorded
 * before that; reconciliation re-examines each of them once.
 */
export const FINANCE_PROBLEM_CODES = [
  "missing_financial_basis",
  "conflicting_recognition",
  "missing_outcome_evidence",
  "missing_purchase_evidence",
  "missing_terms_evidence",
] as const

/** The codes of a delivered Order whose purchase basis is not established. */
export const BASIS_PROBLEM_CODES: FinanceProblemCode[] = [
  "missing_financial_basis",
  "missing_purchase_evidence",
  "missing_terms_evidence",
]
export type FinanceProblemCode = (typeof FINANCE_PROBLEM_CODES)[number]

/**
 * A visible evidence problem on a source, recorded once per source and code,
 * so recovery stops retrying it and the statement withholds what it affects
 * instead of presenting a guessed or overwritten amount.
 */
const FinanceProblem = model
  .define("finance_problem", {
    id: model.id({ prefix: "fprob" }).primaryKey(),
    source_kind: model.enum([...FINANCE_SOURCE_KINDS]),
    source_id: model.text(),
    restaurant_id: model.text(),
    order_id: model.text().nullable(),
    code: model.enum([...FINANCE_PROBLEM_CODES]),
    original_month: model.text(),
    detected_at: model.dateTime(),
  })
  .indexes([
    { on: ["source_kind", "source_id", "code"], unique: true },
    { on: ["restaurant_id", "original_month"] },
  ])

export default FinanceProblem
