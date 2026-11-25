import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  exactAmount,
  FINANCE_TIMEZONE,
  isCalendarMonth,
} from "./calculation"
import { FINANCE_PROBLEM_CODES } from "../../modules/restaurant-finance/models/finance-problem"
import { unaccountedHandovers } from "./recognition"
import {
  restaurantCancellations,
  unaccountedCancellations,
} from "./cancellation-recognition"
import { readParticipation } from "./service-fee-accrual"
import {
  serviceFeeEvidence,
  serviceFeeStanding,
  type ParticipationFacts,
  type ServiceFeeEvidence,
} from "./service-fee"
import {
  assembleStatementHeader,
  outcomesWithoutEntitlement,
  statementDays,
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

/** A booked amount as its stored exact decimal (spec #52 §10). */
const exact = (entry: object, key: "food_credit" | "commission" | "amount") =>
  exactAmount(entry, key)

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

type ProblemSource = StatementProblem["sources"][number]

const problemOf = (
  code: StatementProblem["code"],
  sources: ProblemSource[],
): StatementProblem => ({ code, count: sources.length, sources })

const handoversOf = (ids: string[]): ProblemSource[] =>
  ids.map((id) => ({ kind: "order_delivered", id }))

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

type AccruedFee = {
  active_dates: unknown
  amount: string
  accrued_at: string
}

/** A cancellation finance has not yet accounted for (#229). */
type UnaccountedCancellation = {
  source: ProblemSource
  /** Its qualifying moment's month. */
  original_month: string
  /** Prepared-food compensation, owed money, rather than a zero outcome. */
  compensation: boolean
}

/**
 * What every month of the request is read from: participation, fee
 * obligations and the Restaurant's cancellations still owed processing.
 */
type FeeContext = {
  restaurant: Restaurant
  participation: ParticipationFacts
  accrued: Map<string, AccruedFee>
  cancellations: UnaccountedCancellation[]
}

async function readUnaccountedCancellations(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<UnaccountedCancellation[]> {
  const owed = await unaccountedCancellations(
    container,
    await restaurantCancellations(container, restaurant_id),
  )
  return owed.map(({ recognition }) => ({
    source: recognition.source,
    original_month: copenhagenMonthOf(recognition.occurred_at),
    compensation: recognition.source.kind === "prepared_food_credit",
  }))
}

async function readFeeContext(
  container: MedusaContainer,
  restaurant: Restaurant,
): Promise<FeeContext> {
  const [participation, fees, cancellations] = await Promise.all([
    readParticipation(container, [restaurant.id]),
    resolveFinance(container).listFinanceServiceFees(
      { restaurant_id: restaurant.id },
      {
        select: ["month", "active_dates", "amount", "raw_amount", "accrued_at"],
        take: null,
      },
    ),
    readUnaccountedCancellations(container, restaurant.id),
  ])
  return {
    restaurant,
    cancellations,
    participation: participation.get(restaurant.id) ?? {
      created_at: restaurant.created_at,
      is_active: false,
      changes: [],
    },
    accrued: new Map(
      fees.map((fee) => [
        fee.month,
        {
          active_dates: fee.active_dates,
          amount: exact(fee, "amount"),
          accrued_at: new Date(fee.accrued_at).toISOString(),
        },
      ]),
    ),
  }
}

/**
 * The month's fee evidence as the statement shows it: the active dates and
 * calculation from the history, and whether the obligation has accrued it.
 */
function feeOf(context: FeeContext, month: string, now: Date) {
  const evidence = serviceFeeEvidence(context.participation, month, now)
  const accrued = context.accrued.get(month)
  return {
    evidence,
    accrued,
    standing: serviceFeeStanding(evidence, accrued),
  }
}

/** The service-fee evidence of a statement response (#228). */
const serviceFeeEvidenceView = (
  fee: ReturnType<typeof feeOf>,
): ServiceFeeEvidence & {
  accrual: { status: string; amount: string | null; accrued_at: string | null }
} => ({
  ...fee.evidence,
  accrual: {
    status: fee.standing.status,
    amount: fee.standing.status === "accrued" ? fee.standing.amount : null,
    accrued_at: fee.accrued?.accrued_at ?? null,
  },
})

const participationProblem = (
  code: StatementProblem["code"],
  restaurant_id: string,
): StatementProblem => ({
  code,
  count: 1,
  sources: [{ kind: "restaurant_participation", id: restaurant_id }],
})

/** The month's header facts: booked amounts and visible problems. */
async function readHeader(
  container: MedusaContainer,
  context: FeeContext,
  month: string,
  now: Date,
): Promise<StatementHeader> {
  const restaurant_id = context.restaurant.id
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
      { select: ["code", "source_kind", "source_id"], take: null },
    ),
  ])
  const problems: StatementProblem[] = FINANCE_PROBLEM_CODES.map((code) =>
    problemOf(
      code,
      recorded
        .filter((problem) => problem.code === code)
        .map(({ source_kind, source_id }) => ({
          kind: source_kind,
          id: source_id,
        })),
    ),
  )
  // Every month, ended ones too, withholds what it knows is still owed: an
  // ended month's handovers wait for the later closing and adjustment work
  // rather than being backdated, and its totals must not look final.
  const [pending, earlier, failed] = await Promise.all([
    unaccountedHandoversIn(container, restaurant_id, {
      $gte: period.starts_at,
      $lt: period.ends_at,
    }),
    isCurrent
      ? unaccountedHandoversIn(container, restaurant_id, {
          $lt: period.starts_at,
        })
      : [],
    // A failed outcome has no supported responsibility journey: nothing is
    // inferred from it (spec #52 §4).
    container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        {
          restaurant_id,
          terminal_outcome: "failed",
          terminal_at: { $gte: period.starts_at, $lt: period.ends_at },
        },
        { select: ["order_id"], take: null },
      ),
  ])
  const cancellationsOf = (
    compensation: boolean,
    inMonth: (original: string) => boolean,
  ) =>
    context.cancellations
      .filter((owed) => owed.compensation === compensation)
      .filter(({ original_month }) => inMonth(original_month))
      .map(({ source }) => source)
  problems.push(
    problemOf("recognition_pending", handoversOf(pending)),
    problemOf("earlier_month_processing_pending", [
      ...handoversOf(earlier),
      // Compensation of an ended month reaches this one as an adjustment.
      ...(isCurrent
        ? cancellationsOf(true, (original) => original < month)
        : []),
    ]),
    problemOf(
      "prepared_food_credit_pending",
      cancellationsOf(true, (original) => original === month),
    ),
    problemOf(
      "cancellation_processing_pending",
      cancellationsOf(false, (original) => original === month),
    ),
    problemOf(
      "responsibility_unknown",
      failed.map(({ order_id }) => ({ kind: "delivery_failed", id: order_id })),
    ),
  )
  const { standing } = feeOf(context, month, now)
  if (standing.status === "evidence_missing")
    problems.push(
      participationProblem("participation_evidence_missing", restaurant_id),
    )
  if (standing.status === "accrual_pending")
    problems.push(
      participationProblem("service_fee_accrual_pending", restaurant_id),
    )
  // Ended months whose verified fee never fully accrued: the difference
  // will reach this month as an adjustment (#230).
  const unaccruedMonths = isCurrent
    ? statementMonths(context.restaurant.created_at, now)
        .filter((earlier) => earlier !== month)
        .filter(
          (earlier) =>
            feeOf(context, earlier, now).standing.status === "accrual_pending",
        )
    : []
  problems.push({
    code: "earlier_month_service_fee_pending",
    count: unaccruedMonths.length,
    sources: unaccruedMonths.map((id) => ({
      kind: "service_fee_month" as const,
      id,
    })),
  })
  return assembleStatementHeader({
    lifecycle: isCurrent ? "provisional" : "closed",
    booked: booked.map((entry) => ({
      food_credit: exact(entry, "food_credit"),
      commission: exact(entry, "commission"),
    })),
    service_fee: standing.status === "accrued" ? standing.amount : null,
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
  const context = await readFeeContext(container, restaurant)
  const [header, [entries, count], monthBooked, zero] = await Promise.all([
    readHeader(container, context, input.month, now),
    resolveFinance(container).listAndCountFinanceJournalEntries(
      { restaurant_id: restaurant.id, posting_month: input.month },
      {
        skip: input.offset,
        take: input.limit,
        order: { posted_at: "DESC", id: "DESC" },
      },
    ),
    // Every entry of the month, for the day-by-day view.
    resolveFinance(container).listFinanceJournalEntries(
      { restaurant_id: restaurant.id, posting_month: input.month },
      {
        select: [
          "posted_at",
          "food_credit",
          "raw_food_credit",
          "commission",
          "raw_commission",
        ],
        take: null,
      },
    ),
    // The month's unsuccessful Orders processed with no entitlement (#229).
    resolveFinance(container).listFinanceReceipts(
      {
        restaurant_id: restaurant.id,
        source_kind: "order_cancelled",
        original_month: input.month,
      },
      { select: ["outcome"], take: null },
    ),
  ])
  const fee = feeOf(context, input.month, now)
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
      service_fee_evidence: serviceFeeEvidenceView(fee),
      days: statementDays({
        month: input.month,
        counted_through: fee.evidence.counted_through,
        active_dates: fee.evidence.active_dates,
        unknown_dates: fee.evidence.unknown_dates,
        booked: monthBooked.map((entry) => ({
          posted_at: entry.posted_at,
          food_credit: exact(entry, "food_credit"),
          commission: exact(entry, "commission"),
        })),
      }),
      outcomes_without_entitlement: outcomesWithoutEntitlement(
        zero.map(({ outcome }) => outcome),
      ),
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
  const context = await readFeeContext(container, restaurant)
  const statements = await Promise.all(
    page.map(async (month) => ({
      month,
      timezone: FINANCE_TIMEZONE,
      ...(await readHeader(container, context, month, now)),
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
