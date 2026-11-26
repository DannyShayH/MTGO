/** Serializable read contract shared by both actor surfaces and persisted closures. */
export type StatementTotal =
  | { status: "available"; amount: string }
  | { status: "unavailable"; reason: string }

export type StatementSnapshot = {
  statement: {
    restaurant: { id: string; name: string }
    month: string
    timezone: string
    period: { starts_at: Date; ends_at: Date }
    lifecycle: "provisional" | "closed"
    completeness: "complete" | "incomplete" | "processing_pending"
    currency_code: string
    amounts_exclude_vat: boolean
    totals: Record<
      "food_credits" | "commission" | "service_fee" | "adjustments" | "balance",
      StatementTotal
    >
    /**
     * The part of `food_credits` MTOGO funds: prepared-food compensation
     * (#256). Closures stored before it existed derive it on read.
     */
    mtogo_funded_food_credits: StatementTotal
    problems: {
      code: string
      count: number
      sources: { kind: string; id: string }[]
    }[]
    service_fee_evidence: {
      month: string
      status: "verified" | "evidence_missing"
      terms_version: string
      policy_amount: string
      month_day_count: number
      counted_through: string | null
      active_dates: string[]
      active_date_count: number
      unknown_dates: string[]
      amount: string | null
      accrual: {
        status: string
        amount: string | null
        accrued_at: string | null
      }
    }
    days: {
      date: string
      participation: "active" | "inactive" | "unknown" | "not_reached"
      orders: number
      food_credit: string
      commission: string
      net: string
    }[]
    outcomes_without_entitlement: { outcome: string; count: number }[]
    verified_at: string
  }
  entries: {
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
    calculation: unknown
    original_statement: { month: string } | null
  }[]
  count: number
  limit: number | null
  offset: number
}
