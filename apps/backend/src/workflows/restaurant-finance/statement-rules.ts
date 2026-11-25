import {
  FINANCE_PROBLEM_CODES,
  type FinanceProblemCode,
} from "../../modules/restaurant-finance/models/finance-problem"
import { MathBN } from "@medusajs/framework/utils"
import { copenhagenDateOf, copenhagenMonthOf } from "./calculation"

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
  /**
   * An existing prepared-food credit of the month that finance has not yet
   * recognized (#229). The recovery sweep recognizes the current month's;
   * an ended month's waits for the later closing and adjustment work.
   */
  | "prepared_food_credit_pending"
  /**
   * A cancellation of the month without prepared food that finance has not
   * yet recorded as processed with no entitlement (#229). It changes no
   * total, but the month is not complete until it is accounted for.
   */
  | "cancellation_processing_pending"
  /**
   * A delivery that ended as failed without a supported responsibility
   * outcome (spec #52 §4): no credit is inferred, so food credits wait.
   */
  | "responsibility_unknown"
  /**
   * The month's active dates cannot be established from recorded
   * activation and deactivation, so its service fee is unknown (#228).
   */
  | "participation_evidence_missing"
  /**
   * The month's service-fee obligation has not yet accrued every active
   * date its evidence shows (#228). Accrual recovers it each minute.
   */
  | "service_fee_accrual_pending"
  /**
   * Shown on the current month: ended months whose fee obligation never
   * accrued every active date. The verified difference reaches the current
   * month as an adjustment once the closing and adjustment work exists.
   */
  | "earlier_month_service_fee_pending"

export type StatementProblem = {
  code: ProblemCode
  count: number
  /** The identified sources, one per counted problem. */
  sources: {
    kind:
      | "order_delivered"
      | "prepared_food_credit"
      | "order_cancelled"
      | "delivery_failed"
      | "restaurant_participation"
      | "service_fee_month"
    id: string
  }[]
}

/** Missing evidence of what a delivered Order earned. */
const DELIVERED_EVIDENCE_PROBLEMS: ProblemCode[] = [
  "missing_financial_basis",
  "conflicting_recognition",
]
/**
 * Missing evidence of an unsuccessful Order's food credit (#229). Every such
 * outcome has zero commission, so only food credits are unknown.
 */
const FOOD_CREDIT_EVIDENCE_PROBLEMS: ProblemCode[] = [
  "missing_outcome_evidence",
  "responsibility_unknown",
]
const EVIDENCE_PROBLEMS: ProblemCode[] = [
  ...FINANCE_PROBLEM_CODES,
  ...FOOD_CREDIT_EVIDENCE_PROBLEMS,
  "participation_evidence_missing",
]
const PENDING_PROBLEMS: ProblemCode[] = [
  "recognition_pending",
  "earlier_month_processing_pending",
  "prepared_food_credit_pending",
  "cancellation_processing_pending",
  "service_fee_accrual_pending",
  "earlier_month_service_fee_pending",
]
/** Later processing of ended months that will arrive as adjustments. */
const ADJUSTMENT_PROBLEMS: ProblemCode[] = [
  "earlier_month_processing_pending",
  "earlier_month_service_fee_pending",
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
  /**
   * The month's accrued service fee, a verified zero for a month without
   * active dates, or `null` when a problem says why it is not known.
   */
  service_fee: string | null
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
 * amounts; nothing is recomputed from aggregated food values. A delivered
 * Order's evidence problem withholds the delivered components and pending
 * processing does too; an unsuccessful Order's (#229) withholds only food
 * credits, since its commission is always zero, in an ended month as much as in the current one.
 * Unknown active days withhold only the fee. Adjustments are those booked
 * in the month; none are booked yet, so they are a verified zero unless
 * earlier months' work is known to be on its way. The balance is food
 * credits minus commission minus the fee plus adjustments, with no
 * earlier balance carried in, and needs every component (spec #52 §8).
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
    if (occurred(DELIVERED_EVIDENCE_PROBLEMS))
      return unavailable("evidence_missing")
    if (key === "food_credit" && occurred(FOOD_CREDIT_EVIDENCE_PROBLEMS))
      return unavailable("evidence_missing")
    if (occurred(["recognition_pending"]))
      return unavailable("processing_pending")
    if (key === "food_credit" && occurred(["prepared_food_credit_pending"]))
      return unavailable("processing_pending")
    return available(sum(key))
  }
  const serviceFee = (): Total => {
    if (occurred(["participation_evidence_missing"]))
      return unavailable("evidence_missing")
    if (facts.service_fee === null || occurred(["service_fee_accrual_pending"]))
      return unavailable("processing_pending")
    return available(facts.service_fee)
  }
  const components = {
    food_credits: delivered("food_credit"),
    commission: delivered("commission"),
    service_fee: serviceFee(),
    adjustments: occurred(ADJUSTMENT_PROBLEMS)
      ? unavailable("processing_pending")
      : available(0),
  }
  const known = Object.values(components).every(
    ({ status }) => status === "available",
  )
  const amountOf = (component: keyof typeof components) =>
    (components[component] as { amount: string }).amount
  const totals = {
    ...components,
    balance: known
      ? available(
          MathBN.add(
            MathBN.sub(
              MathBN.sub(amountOf("food_credits"), amountOf("commission")),
              amountOf("service_fee"),
            ),
            amountOf("adjustments"),
          ),
        )
      : unavailable("depends_on_unavailable"),
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

export type StatementDay = {
  date: string
  /** Whether the date counts for the service fee, or is still ahead. */
  participation: "active" | "inactive" | "unknown" | "not_reached"
  /** Entries booked on the date, by their Copenhagen posting date. */
  orders: number
  food_credit: string
  commission: string
  net: string
}

/**
 * The month day by day (#228): each Copenhagen date with its participation
 * for the fee and the entries booked on it. It describes booked entries,
 * which are readable whatever the totals' availability; it is not a monthly
 * total and never replaces one that is withheld.
 */
export function statementDays(input: {
  month: string
  counted_through: string | null
  active_dates: string[]
  unknown_dates: string[]
  booked: {
    posted_at: Date | string
    food_credit: string
    commission: string
  }[]
}): StatementDay[] {
  const [year, monthNumber] = input.month.split("-").map(Number)
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const byDate = new Map<string, typeof input.booked>()
  for (const entry of input.booked) {
    const date = copenhagenDateOf(entry.posted_at)
    byDate.set(date, [...(byDate.get(date) ?? []), entry])
  }
  const active = new Set(input.active_dates)
  const unknown = new Set(input.unknown_dates)
  return Array.from({ length: count }, (_, index) => {
    const date = `${input.month}-${String(index + 1).padStart(2, "0")}`
    const entries = byDate.get(date) ?? []
    const sum = (key: "food_credit" | "commission") =>
      entries.reduce(
        (total, entry) => MathBN.add(total, entry[key]),
        MathBN.convert(0),
      )
    const food_credit = sum("food_credit")
    const commission = sum("commission")
    const reached =
      input.counted_through !== null && date <= input.counted_through
    let participation: StatementDay["participation"] = "inactive"
    if (!reached) participation = "not_reached"
    else if (active.has(date)) participation = "active"
    else if (unknown.has(date)) participation = "unknown"
    return {
      date,
      participation,
      orders: entries.length,
      food_credit: food_credit.toString(),
      commission: commission.toString(),
      net: MathBN.sub(food_credit, commission).toString(),
    }
  })
}

/**
 * The month's unsuccessful Orders that finance processed with no
 * entitlement (#229), counted by outcome: rejection, acceptance timeout,
 * Customer cancellation, and unassigned or operator cancellation before
 * preparation. They book nothing, so they are not entries; this shows they
 * were accounted for rather than never assessed.
 */
export function outcomesWithoutEntitlement(outcomes: string[]) {
  const counts = new Map<string, number>()
  for (const outcome of outcomes)
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1)
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([outcome, count]) => ({ outcome, count }))
}
