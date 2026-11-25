import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { log } from "@lib/logger"
import { STATEMENT_PAGE_SIZE } from "@lib/statement-query"
import { sessionEndedCode } from "./staff"

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
  amounts_exclude_vat: true
  totals: Record<StatementComponent, StatementTotal>
  problems: StatementProblem[]
}

export type StatementEntry = {
  id: string
  /** `delivered_order` or `prepared_food_compensation` (#229). */
  kind: string
  source: { kind?: string; id?: string }
  order: { id: string; display_id: number | null } | null
  outcome: string
  occurred_at: string
  original_month: string
  posted_at: string
  posting_month: string
  amounts: { food_credit: string; commission: string; net: string }
  funded_by: "customer" | "mtogo"
  calculation: {
    terms_version?: string
    vat_rate?: string
    food_value_including_vat?: string
    food_value_excluding_vat?: string
  } | null
}

/**
 * How the month's service fee is calculated (#228): its active Copenhagen
 * dates from the recorded participation history, the month's day count and
 * the policy amount, and whether the obligation has booked it.
 */
export type ServiceFeeEvidence = {
  status: "verified" | "evidence_missing"
  month: string
  terms_version: string
  policy_amount: string
  month_day_count: number
  counted_through: string | null
  active_dates: string[]
  active_date_count: number
  unknown_dates: string[]
  amount: string | null
  accrual: {
    status: "accrued" | "accrual_pending" | "evidence_missing"
    amount: string | null
    accrued_at: string | null
  }
}

/** One date of the month: its fee participation and booked entries (#228). */
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
    /** Unsuccessful Orders processed with no entitlement, by outcome (#229). */
    outcomes_without_entitlement: { outcome: string; count: number }[]
    verified_at: string
  }
  entries: StatementEntry[]
  count: number
  limit: number
  offset: number
}

export type StatementMonths = {
  statements: StatementHeader[]
  count: number
}

async function partnerFetch<T>(path: string): Promise<T> {
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  return sdk.client.fetch<T>(path, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  })
}

/**
 * Ends the session when access ended; a withheld or unknown month is
 * "not_found", and any other failure is logged and returned as `null`, so
 * the page shows a failed read instead of an empty month.
 */
function failure(route: string, error: unknown): "not_found" | null {
  const code = sessionEndedCode(error)
  if (code) redirect(`/session-ended?code=${code}`)
  if (error instanceof FetchError && error.status === 404) return "not_found"
  log("upstream.request.failed", {
    route,
    method: "GET",
    status: error instanceof FetchError ? error.status : undefined,
  })
  return null
}

/** The Restaurant's statement months, newest first. */
export async function listStatementMonths(
  restaurant_id: string,
): Promise<StatementMonths | "not_found" | null> {
  try {
    return await partnerFetch<StatementMonths>(
      `/partner/restaurants/${encodeURIComponent(restaurant_id)}/statements?limit=50`,
    )
  } catch (error) {
    return failure("/partner/restaurants/:id/statements", error)
  }
}

/** One month's statement with one page of its entries. */
export async function retrieveStatement(
  restaurant_id: string,
  month: string,
  page: number,
): Promise<Statement | "not_found" | null> {
  const query = new URLSearchParams({
    limit: String(STATEMENT_PAGE_SIZE),
    offset: String((page - 1) * STATEMENT_PAGE_SIZE),
  })
  try {
    return await partnerFetch<Statement>(
      `/partner/restaurants/${encodeURIComponent(restaurant_id)}/statements/${encodeURIComponent(month)}?${query}`,
    )
  } catch (error) {
    return failure("/partner/restaurants/:id/statements/:month", error)
  }
}
