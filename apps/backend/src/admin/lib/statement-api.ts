/**
 * The Restaurant statement read contract (#227, #232), as the Admin
 * consumes it. Operators and Restaurant staff get the same response; Admin
 * shows it in English (ADR-0018). Unknown codes read as their code, so a
 * later financial kind is visible before it has its own wording.
 */

/** A month total: an exact decimal string, or explicitly unavailable. */
export type StatementTotal =
  | { status: "available"; amount: string }
  | { status: "unavailable"; reason: string }

export type StatementComponent =
  "food_credits" | "commission" | "service_fee" | "adjustments" | "balance"

export type StatementProblem = {
  code: string
  count: number
  sources: { kind: string; id: string }[]
}

export type StatementHeader = {
  month: string
  lifecycle: "provisional" | "closed"
  completeness: "complete" | "incomplete" | "processing_pending"
  currency_code: string
  amounts_exclude_vat: boolean
  totals: Record<StatementComponent, StatementTotal>
  problems: StatementProblem[]
}

export type StatementEntry = {
  id: string
  kind: string
  source: { kind?: string; id?: string }
  order: { id: string; display_id: number | null } | null
  outcome?: string
  occurred_at: string
  original_month: string
  posted_at: string
  posting_month: string
  amounts: {
    food_credit: string
    commission: string
    service_fee?: string
    net: string
  }
  funded_by: string
  calculation: Record<string, unknown> | null
  /** The closed month a later entry adjusts (#230). */
  original_statement: { month: string } | null
}

export type ServiceFeeEvidence = {
  status: string
  terms_version: string
  policy_amount: string
  month_day_count: number
  counted_through: string | null
  active_date_count: number
  unknown_dates: string[]
  amount: string | null
  accrual: { status: string; amount: string | null; accrued_at: string | null }
}

/** One Copenhagen date: its fee participation and booked entries (#228). */
export type StatementDay = {
  date: string
  participation: "active" | "inactive" | "unknown" | "not_reached"
  orders: number
  food_credit: string
  commission: string
  net: string
}

export type Statement = {
  statement: StatementHeader & {
    restaurant: { id: string; name: string }
    timezone: string
    service_fee_evidence: ServiceFeeEvidence
    days: StatementDay[]
    outcomes_without_entitlement: { outcome: string; count: number }[]
    verified_at: string
  }
  entries: StatementEntry[]
  count: number
  limit: number
  offset: number
}

export type StatementMonths = {
  restaurant: { id: string; name: string }
  statements: StatementHeader[]
  count: number
}

export const STATEMENT_PAGE_SIZE = 20

export const STATEMENT_COMPONENTS: StatementComponent[] = [
  "food_credits",
  "commission",
  "service_fee",
  "adjustments",
  "balance",
]

/** Charges reduce the balance; they are labeled, not only signed. */
export const DEDUCTED_COMPONENTS: StatementComponent[] = [
  "commission",
  "service_fee",
]

export const componentLabels: Record<StatementComponent, string> = {
  food_credits: "Food credit",
  commission: "Commission",
  service_fee: "Service fee",
  adjustments: "Adjustments",
  balance: "Monthly balance",
}

/** A code's English label; a code without one reads as itself. */
export const labelFor = (labels: Record<string, string>, code: string) =>
  labels[code] ?? code

export const lifecycleLabels: Record<StatementHeader["lifecycle"], string> = {
  provisional: "Provisional",
  closed: "Closed",
}

export const completenessLabels: Record<
  StatementHeader["completeness"],
  string
> = {
  complete: "Complete",
  incomplete: "Incomplete",
  processing_pending: "Processing pending",
}

export const completenessExplanations: Record<
  StatementHeader["completeness"],
  string
> = {
  complete:
    "Everything the month's amounts are based on is documented and booked.",
  incomplete:
    "Some evidence is missing or a component is not calculated yet, so the affected amounts and the balance are withheld.",
  processing_pending:
    "Known financial processing is still owed, so the affected amounts and the balance are withheld until it is booked.",
}

const reasonLabels: Record<string, string> = {
  not_yet_supported: "Not calculated yet",
  evidence_missing: "Evidence missing",
  processing_pending: "Still processing",
  depends_on_unavailable: "Needs every amount above",
}
export const reasonLabel = (reason: string) =>
  reasonLabels[reason] ?? `Unavailable (${reason})`

const problemTexts: Record<string, string> = {
  missing_financial_basis:
    "{count} delivered Orders have no preserved purchase terms, so their food credit and commission cannot be calculated.",
  missing_purchase_evidence:
    "{count} delivered Orders cannot show exactly what was bought and at which price, so their food credit and commission cannot be calculated. Today's menu is not used instead.",
  missing_terms_evidence:
    "{count} delivered Orders cannot show which terms applied when they were bought, so their food credit and commission cannot be calculated. Today's agreement is not used instead.",
  conflicting_recognition:
    "{count} delivered Orders have details that do not match what was already booked. The amount has not been changed.",
  recognition_pending:
    "{count} delivered Orders from this month are not booked yet.",
  earlier_month_processing_pending:
    "{count} Orders from earlier months await processing and will appear later as adjustments.",
  prepared_food_credit_pending:
    "{count} Orders have prepared-food compensation that is not booked yet.",
  cancellation_processing_pending:
    "{count} cancelled Orders without prepared food are not processed yet. They earn no food credit.",
  missing_outcome_evidence:
    "{count} cancelled Orders lack the record of why or when they were cancelled, so their food credit cannot be established.",
  responsibility_unknown:
    "{count} deliveries failed without recorded responsibility. No food credit is calculated from that alone.",
  participation_evidence_missing:
    "The activation and deactivation history is missing for part of the month, so the service fee cannot be calculated.",
  service_fee_accrual_pending:
    "The service fee for the latest active days is not booked yet.",
  earlier_month_evidence_missing:
    "Evidence for earlier months is missing. Adjustments and the balance are withheld until the amounts can be established.",
  earlier_month_service_fee_pending:
    "The service fee of {count} earlier months is not fully booked and will appear later as an adjustment.",
}
export const problemText = ({ code, count }: StatementProblem) =>
  (problemTexts[code] ?? "Some financial evidence needs attention ({code}).")
    .replace("{count}", String(count))
    .replace("{code}", code)

const outcomeLabels: Record<string, string> = {
  delivered: "Delivered",
  unassigned_timeout: "No Delivery agent by the deadline",
  operator_cancelled: "Cancelled by MTOGO",
  restaurant_rejected: "Rejected by the Restaurant",
  acceptance_timeout: "Not accepted in time",
  customer_cancelled: "Cancelled by the Customer",
}
export const outcomeLabel = (outcome?: string) =>
  outcome ? labelFor(outcomeLabels, outcome) : "Unknown outcome"

const kindLabels: Record<string, string> = {
  delivered_order: "Delivered Order",
  prepared_food_compensation: "Prepared-food compensation",
  service_fee_difference: "Service-fee adjustment",
}
export const kindLabel = (kind: string) => labelFor(kindLabels, kind)

const fundingLabels: Record<string, string> = {
  customer: "Customer purchase",
  mtogo: "Paid by MTOGO",
}
export const fundingLabel = (funded_by: string) =>
  labelFor(fundingLabels, funded_by)

export const participationLabels: Record<
  StatementDay["participation"],
  string
> = {
  active: "Active",
  inactive: "Not active",
  unknown: "Unknown",
  not_reached: "Not reached yet",
}

/** Problem sources that are Orders, so the problem can link to them. */
export const ORDER_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "order_delivered",
  "order_cancelled",
  "delivery_failed",
])

const EXACT_DKK = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "DKK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

/**
 * An exact decimal amount as the backend sent it, formatted from the
 * string so no binary rounding occurs; another currency is shown as sent.
 * A negative amount starts with a minus sign that never wraps on its own.
 */
export const formatAmount = (amount: string, currency = "dkk") =>
  (currency === "dkk"
    ? EXACT_DKK.format(amount as unknown as number)
    : `${currency.toUpperCase()} ${amount}`
  ).replace(/^-/, "\u2212")

const EXACT_PERCENT = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 2,
})
/** A rate such as `"0.25"` as `25%`, formatted from its exact string. */
export const formatRate = (rate: string) =>
  EXACT_PERCENT.format(rate as unknown as number)

const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
/** A `YYYY-MM` month as `November 2026`. */
export const formatMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number)
  return MONTH.format(new Date(Date.UTC(year, number - 1, 1)))
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
/** A Copenhagen calendar date (`YYYY-MM-DD`) as `26 Nov 2026`. */
export const formatDate = (date: string) =>
  DATE.format(new Date(`${date}T00:00:00Z`))

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Copenhagen",
})
/** A moment in Copenhagen time. */
export const formatDateTime = (moment: string) =>
  DATE_TIME.format(new Date(moment))

const MONTH_OF = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Europe/Copenhagen",
})
/** The current Copenhagen month (`YYYY-MM`), the default statement month. */
export const currentCopenhagenMonth = (now = new Date()) =>
  MONTH_OF.format(now).slice(0, 7)

export const isStatementMonth = (value: string | null): value is string =>
  !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

/** The month an entry originally belongs to, when it was booked later. */
export const originalStatementMonth = (entry: StatementEntry) =>
  entry.original_statement?.month ??
  (entry.original_month === entry.posting_month ? null : entry.original_month)
