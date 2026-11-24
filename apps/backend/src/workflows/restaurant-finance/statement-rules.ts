import {
  FINANCE_PROBLEM_CODES,
  type FinanceProblemCode,
} from "../../modules/restaurant-finance/models/finance-problem"
import { MathBN } from "@medusajs/framework/utils"
import { copenhagenMonthOf } from "./calculation"

/**
 * How a statement presents what is known (spec #52 §8, §10): each component
 * total is an exact decimal string or explicitly unavailable with a safe
 * reason, never a zero or a subtotal standing in for an unknown amount.
 */

export type StatementComponent =
  "food_credits" | "commission" | "service_fee" | "adjustments"

export type UnavailableReason =
  /** A financial kind this release does not calculate yet. */
  | "not_yet_supported"
  /** A source's evidence is missing or contradicts what was booked. */
  | "evidence_missing"
  /** Known financial processing has not finished. */
  | "processing_pending"
  /** The balance needs every component. */
  | "depends_on_unavailable"

export type Total =
  | { status: "available"; amount: string }
  | { status: "unavailable"; reason: UnavailableReason }

export type ProblemCode =
  | FinanceProblemCode
  /**
   * A handover of the statement's month that is neither recognized nor an
   * evidence problem. In an ended month it waits for the later closing and
   * adjustment work, so that month's delivered totals stay withheld.
   */
  | "recognition_pending"
  /**
   * Shown on the current month: handovers of ended months that will reach
   * it as adjustments once the later closing and adjustment work exists.
   */
  | "earlier_month_processing_pending"
  /** Prepared-food compensation that this release does not recognize yet. */
  | "prepared_food_credit_pending"

export type StatementProblem = {
  code: ProblemCode
  count: number
  /** The identified sources, one per counted problem. */
  sources: { kind: "order_delivered"; id: string }[]
}

const EVIDENCE_PROBLEMS: ProblemCode[] = [...FINANCE_PROBLEM_CODES]
const PENDING_PROBLEMS: ProblemCode[] = [
  "recognition_pending",
  "earlier_month_processing_pending",
  "prepared_food_credit_pending",
]

/**
 * A month is closed from the exact Copenhagen boundary on (spec #52 §7):
 * nothing posts into it after that, so its journal membership is fixed and
 * later processing reaches the current month instead. Closing is not
 * verification; its problems stay visible (§8).
 */
export type Lifecycle = "provisional" | "closed"

export type Completeness = "complete" | "incomplete" | "processing_pending"

/** The facts a statement header is assembled from, read for one month. */
export type StatementFacts = {
  lifecycle: Lifecycle
  /** Booked amounts of every entry posted in the month. */
  booked: { food_credit: string; commission: string }[]
  problems: StatementProblem[]
}

export type StatementHeader = {
  lifecycle: Lifecycle
  completeness: Completeness
  totals: Record<StatementComponent | "balance", Total>
  problems: StatementProblem[]
}

const available = (amount: MathBN | string | number): Total => ({
  status: "available",
  amount: MathBN.convert(amount as string).toString(),
})
const unavailable = (reason: UnavailableReason): Total => ({
  status: "unavailable",
  reason,
})

const isProblemOf = (codes: ProblemCode[]) => (problem: StatementProblem) =>
  codes.includes(problem.code)

/**
 * Why a month is or is not complete (spec #52 §8), from its totals and the
 * problems that occurred. Missing evidence comes first, because it does not
 * resolve by waiting; known pending processing comes next. A component that
 * is not calculated yet still keeps the month incomplete.
 */
export function completenessOf(
  totals: Record<string, Total>,
  problems: StatementProblem[],
): Completeness {
  if (problems.some(isProblemOf(EVIDENCE_PROBLEMS))) return "incomplete"
  if (problems.some(isProblemOf(PENDING_PROBLEMS))) return "processing_pending"
  return Object.values(totals).every(({ status }) => status === "available")
    ? "complete"
    : "incomplete"
}

/**
 * The month's totals, availability and completeness. Totals sum the booked
 * amounts; nothing is recomputed from aggregated food values. An evidence
 * problem withholds the delivered components and pending processing does
 * too, in an ended month as much as in the current one. The balance needs
 * every component, so a component not calculated yet withholds it.
 */
export function assembleStatementHeader(
  facts: StatementFacts,
): StatementHeader {
  const problems = facts.problems.filter(({ count }) => count > 0)
  const occurred = (codes: ProblemCode[]) => problems.some(isProblemOf(codes))
  const sum = (key: "food_credit" | "commission") =>
    facts.booked.reduce(
      (total, entry) => MathBN.add(total, entry[key]),
      MathBN.convert(0),
    )
  const delivered = (key: "food_credit" | "commission"): Total => {
    if (occurred(EVIDENCE_PROBLEMS)) return unavailable("evidence_missing")
    if (occurred(["recognition_pending"]))
      return unavailable("processing_pending")
    if (key === "food_credit" && occurred(["prepared_food_credit_pending"]))
      return unavailable("processing_pending")
    return available(sum(key))
  }
  const totals = {
    food_credits: delivered("food_credit"),
    commission: delivered("commission"),
    service_fee: unavailable("not_yet_supported"),
    adjustments: unavailable("not_yet_supported"),
    // The balance needs every component; the fee is not calculated yet.
    balance: unavailable("depends_on_unavailable"),
  }
  return {
    lifecycle: facts.lifecycle,
    completeness: completenessOf(totals, problems),
    totals,
    problems,
  }
}

/**
 * The months a Restaurant has statements for, newest first (spec #52 §10):
 * from its creation month to the current Copenhagen month, gaps included,
 * never a future month or one before it existed.
 */
export function statementMonths(created_at: Date | string, now: Date) {
  const first = copenhagenMonthOf(created_at)
  const months: string[] = []
  let [year, month] = copenhagenMonthOf(now).split("-").map(Number)
  for (;;) {
    const value = `${year}-${String(month).padStart(2, "0")}`
    if (value < first) break
    months.push(value)
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
  }
  return months
}

/** A booked journal entry as the statement reads it, amounts exact. */
export type BookedEntry = {
  id: string
  kind: string
  order_id: string | null
  occurred_at: Date | string
  original_month: string
  posted_at: Date | string
  posting_month: string
  funded_by: string
  food_credit: string
  commission: string
}

/** The receipt that recognized an entry's source, with its evidence. */
export type EntryReceipt = {
  source_kind: string
  source_id: string
  outcome: string
  evidence: unknown
}

/**
 * One statement entry (spec #52 §10): its source, optional Order, dates,
 * booked amounts with their net, funding and calculation explanation. A
 * missing receipt or Order number is shown as unknown, never invented.
 */
export function statementEntry(
  entry: BookedEntry,
  receipt: EntryReceipt | undefined,
  displayIds: ReadonlyMap<string, number | null | undefined>,
) {
  return {
    id: entry.id,
    kind: entry.kind,
    source: { kind: receipt?.source_kind, id: receipt?.source_id },
    order: entry.order_id
      ? {
          id: entry.order_id,
          display_id: displayIds.get(entry.order_id) ?? null,
        }
      : null,
    outcome: receipt?.outcome,
    occurred_at: new Date(entry.occurred_at).toISOString(),
    original_month: entry.original_month,
    posted_at: new Date(entry.posted_at).toISOString(),
    posting_month: entry.posting_month,
    amounts: {
      food_credit: entry.food_credit,
      commission: entry.commission,
      net: MathBN.sub(entry.food_credit, entry.commission).toString(),
    },
    funded_by: entry.funded_by,
    calculation: receipt?.evidence ?? null,
    // Adjustments of a closed month will link their original statement.
    original_statement: null,
  }
}
