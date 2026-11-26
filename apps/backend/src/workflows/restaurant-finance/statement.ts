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
import { statementMonths } from "./statement-rules"
import { readLiveStatement, type StatementReadInput } from "./statement-read"
export type { StatementReadInput } from "./statement-read"
import type { StatementSnapshot } from "../../types/restaurant-statement"
export type { StatementSnapshot } from "../../types/restaurant-statement"
type Page = { limit: number; offset: number }

/** Reads never close or recognize. Ended months use their boundary cutoff even before materialization. */
export async function readStatement(
  container: MedusaContainer,
  input: StatementReadInput,
): Promise<StatementSnapshot> {
  const lock = restaurantFinanceLock(input.restaurant_id)
  return container
    .resolve(Modules.LOCKING)
    .execute(lock.key, () => readGuardedStatement(container, input), {
      timeout: lock.timeout,
      expire: lock.ttl,
    })
}

async function readGuardedStatement(
  container: MedusaContainer,
  input: StatementReadInput,
): Promise<StatementSnapshot> {
  if (!isCalendarMonth(input.month))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "statement_month_invalid",
      "statement_month_invalid",
    )
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
  const [closure] = await container
    .resolve<RestaurantFinanceModuleService>(RESTAURANT_FINANCE_MODULE)
    .listFinanceClosures(
      { restaurant_id: input.restaurant_id, month: input.month },
      { take: 1 },
    )
  if (closure) {
    const snapshot = closure.snapshot as unknown as StatementSnapshot
    return {
      ...snapshot,
      entries: snapshot.entries.slice(input.offset, input.offset + input.limit),
      limit: input.limit,
      offset: input.offset,
    }
  }
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
