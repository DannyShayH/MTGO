import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  isCalendarMonth,
} from "./calculation"
import { restaurantFinanceLock } from "./locks"
import {
  mtogoFundedFoodCredits,
  statementMonths,
  type Total,
} from "./statement-rules"
import { readLiveStatement, type StatementReadInput } from "./statement-read"
export type { StatementReadInput } from "./statement-read"
import type { StatementSnapshot } from "../../types/restaurant-statement"
export type { StatementSnapshot } from "../../types/restaurant-statement"
type Page = { limit: number; offset: number }

/**
 * Guarded reads still waiting for the finance guard, by Restaurant, month and
 * page. A read leaves this map the moment it enters the guard.
 */
const waitingReads = new Map<string, Promise<StatementSnapshot>>()

/**
 * Reads never close or recognize. Ended months use their boundary cutoff even
 * before materialization. A closed statement is fixed (ADR-0023), so it is
 * served without waiting for the Restaurant's finance guard; only a month
 * still open to posting or closing is read under it (#235).
 *
 * The guard keeps a read consistent with posting, not with other reads. So
 * readers of the same page that are all still waiting for the guard share
 * one guarded read: it starts after every one of them asked, exactly as each
 * own read would have, but they no longer queue behind each other (#235).
 */
export async function readStatement(
  container: MedusaContainer,
  input: StatementReadInput,
): Promise<StatementSnapshot> {
  assertCalendarMonth(input.month)
  if (input.month !== copenhagenMonthOf(new Date())) {
    const closed = await readClosedStatement(container, input)
    if (closed) return closed
  }
  const key = [
    input.restaurant_id,
    input.month,
    input.limit,
    input.offset,
  ].join(":")
  let shared = waitingReads.get(key)
  if (!shared) {
    const lock = restaurantFinanceLock(input.restaurant_id)
    // Declared first, so the guarded job can compare against it whenever
    // the locking provider runs it.
    let read: Promise<StatementSnapshot> | undefined = undefined
    read = container
      .resolve(Modules.LOCKING)
      .execute(
        lock.key,
        () => {
          if (waitingReads.get(key) === read) waitingReads.delete(key)
          return readGuardedStatement(container, input)
        },
        { timeout: lock.timeout, expire: lock.ttl },
      )
      .finally(() => {
        // A read that never entered the guard (a timeout) stops collecting.
        if (waitingReads.get(key) === read) waitingReads.delete(key)
      })
    shared = read
    waitingReads.set(key, shared)
  }
  // Each caller gets its own copy, so no caller can change another's result.
  return structuredClone(await shared)
}

const assertCalendarMonth = (month: string) => {
  if (!isCalendarMonth(month))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "statement_month_invalid",
      "statement_month_invalid",
    )
}

/** The month's fixed closed statement, one page of it, or null before closure. */
async function readClosedStatement(
  container: MedusaContainer,
  input: StatementReadInput,
): Promise<StatementSnapshot | null> {
  const [closure] = await container
    .resolve<RestaurantFinanceModuleService>(RESTAURANT_FINANCE_MODULE)
    .listFinanceClosures(
      { restaurant_id: input.restaurant_id, month: input.month },
      { take: 1 },
    )
  if (!closure) return null
  const snapshot = closure.snapshot as unknown as StatementSnapshot
  return {
    ...snapshot,
    statement: {
      ...snapshot.statement,
      // A closure stored before #256 holds every entry, so its MTOGO-funded
      // credits are derived from them by the same rule.
      mtogo_funded_food_credits:
        snapshot.statement.mtogo_funded_food_credits ??
        mtogoFundedFoodCredits(
          snapshot.statement.totals.food_credits as Total,
          snapshot.entries.map((entry) => ({
            food_credit: entry.amounts.food_credit,
            funded_by: entry.funded_by,
            is_adjustment: entry.original_month !== entry.posting_month,
          })),
        ),
    },
    entries: snapshot.entries.slice(input.offset, input.offset + input.limit),
    limit: input.limit,
    offset: input.offset,
  }
}

async function readGuardedStatement(
  container: MedusaContainer,
  input: StatementReadInput,
): Promise<StatementSnapshot> {
  const now = new Date()
  const [restaurant] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants(
      { id: input.restaurant_id },
      { take: 1, withDeleted: true },
    )
  if (
    !restaurant ||
    !statementMonths(restaurant.created_at, now).includes(input.month)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "statement_not_found",
      "statement_not_found",
    )
  if (input.month === copenhagenMonthOf(now))
    return readLiveStatement(container, input, now)
  const closed = await readClosedStatement(container, input)
  if (closed) return closed
  const cutoff = copenhagenMonthPeriod(input.month).ends_at
  return readLiveStatement(container, input, cutoff, cutoff)
}

/** Whole-month summaries use the same snapshot contract as the detail. */
export async function listStatements(
  container: MedusaContainer,
  input: { restaurant_id: string } & Page,
) {
  const now = new Date()
  const [restaurant] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants(
      { id: input.restaurant_id },
      { take: 1, withDeleted: true },
    )
  if (!restaurant)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "statement_not_found",
      "statement_not_found",
    )
  const months = statementMonths(restaurant.created_at, now)
  const statements: (Omit<
    StatementSnapshot["statement"],
    | "restaurant"
    | "period"
    | "service_fee_evidence"
    | "days"
    | "outcomes_without_entitlement"
    | "verified_at"
  > & {
    month: string
    timezone: string
    currency_code: string
    amounts_exclude_vat: boolean
  })[] = []
  for (const month of months.slice(input.offset, input.offset + input.limit)) {
    const { statement } = await readStatement(container, {
      restaurant_id: input.restaurant_id,
      month,
      limit: 0,
      offset: 0,
    })
    const {
      lifecycle,
      completeness,
      totals,
      mtogo_funded_food_credits,
      problems,
      timezone,
      currency_code,
      amounts_exclude_vat,
    } = statement
    statements.push({
      month,
      lifecycle,
      completeness,
      totals,
      mtogo_funded_food_credits,
      problems,
      timezone,
      currency_code,
      amounts_exclude_vat,
    })
  }
  return {
    restaurant: { id: restaurant.id, name: restaurant.name },
    statements,
    count: months.length,
    ...input,
    verified_at: now.toISOString(),
  }
}

const readStatementStep = createStep(
  "read-statement",
  async (input: StatementReadInput, { container }) =>
    new StepResponse(await readStatement(container, input)),
)

const listStatementsStep = createStep(
  "list-statements",
  async (input: { restaurant_id: string } & Page, { container }) =>
    new StepResponse(await listStatements(container, input)),
)

type PartnerInput = { staff_id: string; restaurant_id: string } & Page

/** Authorizes live staff of this very Restaurant, active or not (ADR-0017). */
const authorizeStaff = (input: PartnerInput) => {
  const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
  return assertOwnRestaurantStep(
    transform({ input, current }, ({ input, current }) => ({
      id: input.restaurant_id,
      staff_restaurant_id: current.restaurant.id,
    })),
  )
}

/** `GET /partner/restaurants/:id/statements/:month` (#227). */
export const retrievePartnerStatementWorkflow = createWorkflow(
  "retrieve-partner-statement",
  function (input: PartnerInput & { month: string }) {
    const authorized = authorizeStaff(input)
    return new WorkflowResponse(
      readStatementStep(
        // `authorized` only orders the read after authorization.
        transform({ input, authorized }, ({ input }) => ({
          restaurant_id: input.restaurant_id,
          month: input.month,
          limit: input.limit,
          offset: input.offset,
        })),
      ),
    )
  },
)

/** `GET /partner/restaurants/:id/statements` (#227). */
export const listPartnerStatementsWorkflow = createWorkflow(
  "list-partner-statements",
  function (input: PartnerInput) {
    const authorized = authorizeStaff(input)
    return new WorkflowResponse(
      listStatementsStep(
        transform({ input, authorized }, ({ input }) => ({
          restaurant_id: input.restaurant_id,
          limit: input.limit,
          offset: input.offset,
        })),
      ),
    )
  },
)

/** Operator routes have Medusa's default authenticated user boundary. */
export const retrieveAdminStatementWorkflow = createWorkflow(
  "retrieve-admin-statement",
  function (input: StatementReadInput) {
    return new WorkflowResponse(readStatementStep(input))
  },
)
export const listAdminStatementsWorkflow = createWorkflow(
  "list-admin-statements",
  function (input: { restaurant_id: string } & Page) {
    return new WorkflowResponse(listStatementsStep(input))
  },
)
