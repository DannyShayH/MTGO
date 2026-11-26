import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import {
  copenhagenMonthOf,
  FINANCE_TIMEZONE,
  isCalendarMonth,
} from "./calculation"
import { readStatement } from "./statement"
import { statementMonths } from "./statement-rules"
import {
  earningsOfMonth,
  restaurantPage,
  statementSummary,
  type EarningsSummary,
  type RestaurantPageQuery,
  type RestaurantStatementSummary,
} from "./earnings-rules"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"

/**
 * MTOGO's earnings across all Restaurants (#256), for operators only. Each
 * Restaurant's month comes from the shared statement read (`readStatement`),
 * the same one its statement page uses, so the live current-month service fee
 * and closed snapshots are both honoured and nothing is calculated twice.
 */

type Restaurant = { id: string; name: string; created_at: Date | string }

const earningsNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "earnings_not_found",
    "earnings_not_found",
  )

/** Every Restaurant ever registered: a removed one still earned its months. */
async function readRestaurants(container: MedusaContainer) {
  return (await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants(
      {},
      {
        select: ["id", "name", "created_at"],
        order: { name: "ASC", id: "ASC" },
        withDeleted: true,
        take: null,
      },
    )) as Restaurant[]
}

/** From the first Restaurant's month to the current one, newest first. */
function earningsMonths(restaurants: Restaurant[], now: Date) {
  const first = restaurants.reduce<Date | string>(
    (earliest, { created_at }) =>
      new Date(created_at) < new Date(earliest) ? created_at : earliest,
    now,
  )
  return statementMonths(first, now)
}

/** At most this many statements are read at once, to spare the database. */
const STATEMENT_READS_AT_ONCE = 10

async function readStatementSummary(
  container: MedusaContainer,
  restaurant_id: string,
  month: string,
) {
  const { statement } = await readStatement(container, {
    restaurant_id,
    month,
    limit: 0,
    offset: 0,
  })
  return statementSummary(statement as Parameters<typeof statementSummary>[0])
}

/**
 * Every Restaurant's statement summary for the month. A closed month is read
 * from the summaries its closures stored (one query, no entries); a Restaurant
 * without one (the current month, an ended month not closed yet, or a closure
 * stored before #256) goes through the statement read, a few at a time.
 */
async function readSummaries(
  container: MedusaContainer,
  restaurants: Restaurant[],
  month: string,
  now: Date,
): Promise<RestaurantStatementSummary[]> {
  const ids = restaurants.map(({ id }) => id)
  const stored = new Map<string, RestaurantStatementSummary>()
  if (ids.length && month < copenhagenMonthOf(now)) {
    const closures = await container
      .resolve<RestaurantFinanceModuleService>(RESTAURANT_FINANCE_MODULE)
      .listFinanceClosures(
        { month, restaurant_id: ids },
        { select: ["restaurant_id", "summary"], take: null },
      )
    for (const { restaurant_id, summary } of closures)
      if (summary)
        stored.set(
          restaurant_id,
          summary as unknown as RestaurantStatementSummary,
        )
  }
  const summaries = new Map(stored)
  const unread = ids.filter((id) => !stored.has(id))
  for (let start = 0; start < unread.length; start += STATEMENT_READS_AT_ONCE)
    await Promise.all(
      unread
        .slice(start, start + STATEMENT_READS_AT_ONCE)
        .map(async (id) =>
          summaries.set(id, await readStatementSummary(container, id, month)),
        ),
    )
  return ids.map((id) => summaries.get(id)!)
}

async function readMonth(
  container: MedusaContainer,
  restaurants: Restaurant[],
  month: string,
  now: Date,
) {
  const existing = restaurants.filter(
    ({ created_at }) => copenhagenMonthOf(created_at) <= month,
  )
  return earningsOfMonth(
    month,
    month === copenhagenMonthOf(now) ? "provisional" : "closed",
    await readSummaries(container, existing, month, now),
  )
}

const contract = (now: Date) => ({
  timezone: FINANCE_TIMEZONE,
  currency_code: "dkk",
  amounts_exclude_vat: true,
  verified_at: now.toISOString(),
})

/** One month's summary with its per-Restaurant breakdown. */
export async function readEarnings(
  container: MedusaContainer,
  input: { month: string } & RestaurantPageQuery,
) {
  if (!isCalendarMonth(input.month))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "earnings_month_invalid",
      "earnings_month_invalid",
    )
  const now = new Date()
  const restaurants = await readRestaurants(container)
  if (!earningsMonths(restaurants, now).includes(input.month))
    throw earningsNotFound()
  const { summary, restaurants: rows } = await readMonth(
    container,
    restaurants,
    input.month,
    now,
  )
  // The summary always covers every Restaurant; the query pages the rows.
  const page = restaurantPage(rows, input)
  return {
    earnings: summary,
    restaurants: page.restaurants,
    count: page.count,
    limit: input.limit,
    offset: input.offset,
    ...contract(now),
  }
}

/** The month list with each month's totals, newest first, for the trend. */
export async function listEarnings(
  container: MedusaContainer,
  input: { limit: number; offset: number },
) {
  const now = new Date()
  const restaurants = await readRestaurants(container)
  const months = earningsMonths(restaurants, now)
  const page = months.slice(input.offset, input.offset + input.limit)
  const summaries: EarningsSummary[] = []
  // One month at a time: each reads every Restaurant's statement.
  for (const month of page)
    summaries.push(
      (await readMonth(container, restaurants, month, now)).summary,
    )
  return {
    months: summaries,
    count: months.length,
    limit: input.limit,
    offset: input.offset,
    ...contract(now),
  }
}

const readEarningsStep = createStep(
  "read-earnings",
  async (input: { month: string } & RestaurantPageQuery, { container }) =>
    new StepResponse(await readEarnings(container, input)),
)

const listEarningsStep = createStep(
  "list-earnings",
  async (input: { limit: number; offset: number }, { container }) =>
    new StepResponse(await listEarnings(container, input)),
)

/** `GET /admin/earnings/:month`: Medusa's authenticated operator boundary. */
export const retrieveAdminEarningsWorkflow = createWorkflow(
  "retrieve-admin-earnings",
  function (input: { month: string } & RestaurantPageQuery) {
    return new WorkflowResponse(readEarningsStep(input))
  },
)

/** `GET /admin/earnings`: the months with their totals, for the trend. */
export const listAdminEarningsWorkflow = createWorkflow(
  "list-admin-earnings",
  function (input: { limit: number; offset: number }) {
    return new WorkflowResponse(listEarningsStep(input))
  },
)
