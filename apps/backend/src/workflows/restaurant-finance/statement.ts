import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  FINANCE_TIMEZONE,
  isCalendarMonth,
} from "./calculation"
import { FINANCE_PROBLEM_CODES } from "../../modules/restaurant-finance/models/finance-problem"
import { unaccountedHandovers } from "./recognition"
import {
  assembleStatementHeader,
  statementEntry,
  statementMonths,
  type StatementHeader,
  type StatementProblem,
} from "./statement-rules"

/**
 * The shared statement read (#227; spec #52 §8, §10): one calculation of a
 * Restaurant's Copenhagen month for every actor surface, after that
 * surface has authorized the caller. It only reads: paging through a
 * statement never books, recognizes or closes anything.
 */

type Finance = RestaurantFinanceModuleService

const resolveFinance = (container: MedusaContainer) =>
  container.resolve<Finance>(RESTAURANT_FINANCE_MODULE)

const statementNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "statement_not_found",
    "statement_not_found",
  )

/**
 * A booked amount as its stored exact decimal, never through a JS number
 * (spec #52 §10); the numeric value is only a fallback.
 */
const exact = (entry: object, key: "food_credit" | "commission") => {
  const record = entry as Record<string, unknown>
  const raw = record[`raw_${key}`] as { value?: string } | undefined
  return raw?.value ?? MathBN.convert(record[key] as string).toString()
}

type Restaurant = { id: string; name: string; created_at: Date | string }

async function readRestaurant(container: MedusaContainer, id: string) {
  const [restaurant] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants(
      { id },
      { take: 1, select: ["id", "name", "created_at"], withDeleted: true },
    )
  if (!restaurant) throw statementNotFound()
  return restaurant as Restaurant
}

const problemOf = (
  code: StatementProblem["code"],
  ids: string[],
): StatementProblem => ({
  code,
  count: ids.length,
  sources: ids.map((id) => ({ kind: "order_delivered" as const, id })),
})

/**
 * The Orders handed over in `terminal_at`'s range that have neither a
 * receipt nor an evidence problem, identified one by one.
 */
async function unaccountedHandoversIn(
  container: MedusaContainer,
  restaurant_id: string,
  terminal_at: { $gte?: Date; $lt: Date },
) {
  const handovers = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      { restaurant_id, terminal_outcome: "delivered", terminal_at },
      { select: ["order_id"], take: null },
    )
  return unaccountedHandovers(
    container,
    handovers.map(({ order_id }) => order_id),
  )
}

/** The month's header facts: booked amounts and visible problems. */
async function readHeader(
  container: MedusaContainer,
  restaurant_id: string,
  month: string,
  now: Date,
): Promise<StatementHeader> {
  const finance = resolveFinance(container)
  const period = copenhagenMonthPeriod(month)
  const isCurrent = month === copenhagenMonthOf(now)
  const [booked, recorded] = await Promise.all([
    finance.listFinanceJournalEntries(
      { restaurant_id, posting_month: month },
      {
        select: [
          "food_credit",
          "raw_food_credit",
          "commission",
          "raw_commission",
        ],
        take: null,
      },
    ),
    finance.listFinanceProblems(
      { restaurant_id, original_month: month },
      { select: ["code", "source_id"], take: null },
    ),
  ])
  const problems: StatementProblem[] = FINANCE_PROBLEM_CODES.map((code) =>
    problemOf(
      code,
      recorded
        .filter((problem) => problem.code === code)
        .map(({ source_id }) => source_id),
    ),
  )
  // Every month, ended ones too, withholds what it knows is still owed: an
  // ended month's handovers wait for the later closing and adjustment work
  // rather than being backdated, and its totals must not look final.
  const [pending, earlier, foodCredits] = await Promise.all([
    unaccountedHandoversIn(container, restaurant_id, {
      $gte: period.starts_at,
      $lt: period.ends_at,
    }),
    isCurrent
      ? unaccountedHandoversIn(container, restaurant_id, {
          $lt: period.starts_at,
        })
      : [],
    // Prepared-food compensation is not recognized by this release yet.
    container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listFoodCredits(
        {
          restaurant_id,
          created_at: { $gte: period.starts_at, $lt: period.ends_at },
        },
        { select: ["order_id"], take: null },
      ),
  ])
  problems.push(
    problemOf("recognition_pending", pending),
    problemOf("earlier_month_processing_pending", earlier),
    problemOf(
      "prepared_food_credit_pending",
      foodCredits.map(({ order_id }) => order_id),
    ),
  )
  return assembleStatementHeader({
    lifecycle: isCurrent ? "provisional" : "closed",
    booked: booked.map((entry) => ({
      food_credit: exact(entry, "food_credit"),
      commission: exact(entry, "commission"),
    })),
    problems,
  })
}

type Page = { limit: number; offset: number }

export type StatementReadInput = {
  restaurant_id: string
  month: string
} & Page

/**
 * One Restaurant month: its header and whole-month totals with one page of
 * entries, newest posting first. A future month, or one before the
 * Restaurant existed, has no statement.
 */
export async function readStatement(
  container: MedusaContainer,
  input: StatementReadInput,
) {
  if (!isCalendarMonth(input.month))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "statement_month_invalid",
      "statement_month_invalid",
    )
  const now = new Date()
  const restaurant = await readRestaurant(container, input.restaurant_id)
  if (!statementMonths(restaurant.created_at, now).includes(input.month))
    throw statementNotFound()
  const [header, [entries, count]] = await Promise.all([
    readHeader(container, restaurant.id, input.month, now),
    resolveFinance(container).listAndCountFinanceJournalEntries(
      { restaurant_id: restaurant.id, posting_month: input.month },
      {
        skip: input.offset,
        take: input.limit,
        order: { posted_at: "DESC", id: "DESC" },
      },
    ),
  ])
  const receipts = entries.length
    ? await resolveFinance(container).listFinanceReceipts(
        { id: entries.map(({ receipt_id }) => receipt_id) },
        { select: ["id", "source_kind", "source_id", "outcome", "evidence"] },
      )
    : []
  const receiptOf = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const orderIds = entries.flatMap(({ order_id }) => order_id ?? [])
  const orders: { id: string; display_id?: unknown }[] = orderIds.length
    ? (
        await container.resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "order",
          fields: ["id", "display_id"],
          filters: { id: orderIds },
        })
      ).data
    : []
  const displayIdOf = new Map(
    orders.map((order) => [order.id, order.display_id as number]),
  )
  return {
    statement: {
      restaurant: { id: restaurant.id, name: restaurant.name },
      month: input.month,
      timezone: FINANCE_TIMEZONE,
      period: copenhagenMonthPeriod(input.month),
      ...header,
      currency_code: "dkk",
      amounts_exclude_vat: true,
      service_fee_evidence: {
        status: "unavailable",
        reason: "not_yet_supported",
      },
      verified_at: now.toISOString(),
    },
    entries: entries.map((entry) =>
      statementEntry(
        {
          ...entry,
          food_credit: exact(entry, "food_credit"),
          commission: exact(entry, "commission"),
        },
        receiptOf.get(entry.receipt_id),
        displayIdOf,
      ),
    ),
    count,
    limit: input.limit,
    offset: input.offset,
  }
}

/** The Restaurant's month summaries, newest first, without entries. */
export async function listStatements(
  container: MedusaContainer,
  input: { restaurant_id: string } & Page,
) {
  const now = new Date()
  const restaurant = await readRestaurant(container, input.restaurant_id)
  const months = statementMonths(restaurant.created_at, now)
  const page = months.slice(input.offset, input.offset + input.limit)
  const statements = await Promise.all(
    page.map(async (month) => ({
      month,
      timezone: FINANCE_TIMEZONE,
      ...(await readHeader(container, restaurant.id, month, now)),
      currency_code: "dkk",
      amounts_exclude_vat: true,
    })),
  )
  return {
    restaurant: { id: restaurant.id, name: restaurant.name },
    statements,
    count: months.length,
    limit: input.limit,
    offset: input.offset,
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
