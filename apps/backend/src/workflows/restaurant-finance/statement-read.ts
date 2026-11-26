import {
  ContainerRegistrationKeys,
  MedusaError,
  MathBN,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  exactAmount,
  FINANCE_TIMEZONE,
  isCalendarMonth,
} from "./calculation"
import {
  BASIS_PROBLEM_CODES,
  FINANCE_PROBLEM_CODES,
  type FinanceProblemCode,
} from "../../modules/restaurant-finance/models/finance-problem"
import { unaccountedHandovers } from "./pending-handovers"
import {
  restaurantCancellations,
  unaccountedCancellations,
} from "./cancellation-sources"
import { readParticipation } from "./participation"
import {
  serviceFeeEvidence,
  serviceFeeStanding,
  type ParticipationFacts,
  type ServiceFeeEvidence,
} from "./service-fee"
import {
  assembleStatementHeader,
  mtogoFundedFoodCredits,
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

import type { StatementSnapshot } from "../../types/restaurant-statement"

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
const exact = (
  entry: object,
  key: "food_credit" | "commission" | "amount" | "service_fee",
) => exactAmount(entry, key)

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
  cutoff?: Date,
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
    cutoff,
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
  feeAdjustments: Map<string, string>
}

async function readUnaccountedCancellations(
  container: MedusaContainer,
  restaurant_id: string,
  cutoff?: Date,
): Promise<UnaccountedCancellation[]> {
  const owed = await unaccountedCancellations(
    container,
    (await restaurantCancellations(container, restaurant_id)).filter(
      (order) => !cutoff || new Date(order.cancelled_at) < cutoff,
    ),
    cutoff,
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
  cutoff?: Date,
): Promise<FeeContext> {
  const [participation, fees, cancellations, adjustments] = await Promise.all([
    readParticipation(container, [restaurant.id]),
    resolveFinance(container).listFinanceServiceFees(
      {
        restaurant_id: restaurant.id,
        ...(cutoff ? { accrued_at: { $lt: cutoff } } : {}),
      },
      {
        select: ["month", "active_dates", "amount", "raw_amount", "accrued_at"],
        take: null,
      },
    ),
    readUnaccountedCancellations(container, restaurant.id, cutoff),
    resolveFinance(container).listFinanceJournalEntries(
      {
        restaurant_id: restaurant.id,
        kind: "service_fee_difference",
        ...(cutoff ? { posted_at: { $lt: cutoff } } : {}),
      },
      { take: null },
    ),
  ])
  const feeAdjustments = new Map<string, string>()
  for (const entry of adjustments)
    feeAdjustments.set(
      entry.original_month,
      MathBN.add(
        feeAdjustments.get(entry.original_month) ?? "0",
        exact(entry, "service_fee"),
      ).toString(),
    )
  return {
    feeAdjustments,
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

/** Subtract every amount already recognized for this one monthly obligation. */
function feeDifferenceOwed(context: FeeContext, month: string, now: Date) {
  const fee = feeOf(context, month, now)
  if (fee.evidence.status !== "verified") return false
  const recognized = MathBN.add(
    fee.accrued?.amount ?? "0",
    context.feeAdjustments.get(month) ?? "0",
  )
  return !MathBN.eq(fee.evidence.amount, recognized)
}

/** The basis problems that name which fact is missing (#231). */
const SPECIFIC_BASIS_CODES: FinanceProblemCode[] = BASIS_PROBLEM_CODES.filter(
  (code) => code !== "missing_financial_basis",
)

type RecordedProblem = {
  code: FinanceProblemCode
  source_kind: StatementProblem["sources"][number]["kind"]
  source_id: string
}

/**
 * The recorded problems that still stand at `cutoff`: a source recognized
 * since, by legacy reconciliation (#231) for instance, no longer withholds
 * anything, except a conflict, whose disagreeing payload stays unresolved.
 * Once reconciliation names the specific missing facts of a handover, its
 * earlier generic `missing_financial_basis` is not counted again. A closed
 * month reads with its boundary cutoff, so its warnings stay fixed.
 */
async function standingProblems<T extends RecordedProblem>(
  container: MedusaContainer,
  restaurant_id: string,
  recorded: T[],
  cutoff?: Date,
): Promise<T[]> {
  if (!recorded.length) return []
  const receipts = await resolveFinance(container).listFinanceReceipts(
    {
      restaurant_id,
      source_id: [...new Set(recorded.map(({ source_id }) => source_id))],
      ...(cutoff ? { posted_at: { $lt: cutoff } } : {}),
    },
    { take: null, select: ["source_kind", "source_id"] },
  )
  const key = ({ source_kind, source_id }: Omit<RecordedProblem, "code">) =>
    `${source_kind}:${source_id}`
  const recognized = new Set(receipts.map(key))
  const named = new Set(
    recorded.filter(({ code }) => SPECIFIC_BASIS_CODES.includes(code)).map(key),
  )
  return recorded.filter(
    (problem) =>
      (problem.code === "conflicting_recognition" ||
        !recognized.has(key(problem))) &&
      !(problem.code === "missing_financial_basis" && named.has(key(problem))),
  )
}

/** The month's header facts: booked amounts and visible problems. */
async function readHeader(
  container: MedusaContainer,
  context: FeeContext,
  month: string,
  now: Date,
  cutoff?: Date,
): Promise<StatementHeader> {
  const restaurant_id = context.restaurant.id
  const finance = resolveFinance(container)
  const period = copenhagenMonthPeriod(month)
  const isCurrent = month === copenhagenMonthOf(now)
  const [booked, recorded] = await Promise.all([
    finance.listFinanceJournalEntries(
      {
        restaurant_id,
        posting_month: month,
        ...(cutoff ? { posted_at: { $lt: cutoff } } : {}),
      },
      {
        select: [
          "food_credit",
          "raw_food_credit",
          "commission",
          "raw_commission",
          "original_month",
          "posting_month",
          "service_fee",
          "raw_service_fee",
        ],
        take: null,
      },
    ),
    finance.listFinanceProblems(
      {
        restaurant_id,
        original_month: month,
        ...(cutoff ? { detected_at: { $lt: cutoff } } : {}),
      },
      { select: ["code", "source_kind", "source_id"], take: null },
    ),
  ])
  const standingRecorded = await standingProblems(
    container,
    restaurant_id,
    recorded,
    cutoff,
  )
  const problems: StatementProblem[] = FINANCE_PROBLEM_CODES.map((code) =>
    problemOf(
      code,
      standingRecorded
        .filter((problem) => problem.code === code)
        .map(({ source_kind, source_id }) => ({
          kind: source_kind,
          id: source_id,
        })),
    ),
  )
  // Earlier-source warnings belong to the posting month even after it closes.
  // The cutoff retains what was unresolved then, regardless of later recovery.
  const [pending, earlier, failed] = await Promise.all([
    unaccountedHandoversIn(
      container,
      restaurant_id,
      {
        $gte: period.starts_at,
        $lt: period.ends_at,
      },
      cutoff,
    ),
    unaccountedHandoversIn(
      container,
      restaurant_id,
      { $lt: period.starts_at },
      cutoff,
    ),
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
      ...cancellationsOf(true, (original) => original < month),
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
  const earlierMonths = statementMonths(
    context.restaurant.created_at,
    now,
  ).filter((earlier) => earlier < month)
  const unaccruedMonths = earlierMonths.filter((earlier) =>
    feeDifferenceOwed(context, earlier, now),
  )
  problems.push({
    code: "earlier_month_service_fee_pending",
    count: unaccruedMonths.length,
    sources: unaccruedMonths.map((id) => ({
      kind: "service_fee_month" as const,
      id,
    })),
  })
  const missingFees = earlierMonths.filter(
    (earlier) =>
      feeOf(context, earlier, now).evidence.status === "evidence_missing",
  )
  const earlierProblems = await finance.listFinanceProblems(
    {
      restaurant_id,
      original_month: { $lt: month },
      ...(cutoff ? { detected_at: { $lt: cutoff } } : {}),
    },
    { take: null },
  )
  const earlierSources = new Map(
    (
      await standingProblems(container, restaurant_id, earlierProblems, cutoff)
    ).map(({ source_kind, source_id }) => [
      `${source_kind}:${source_id}`,
      { kind: source_kind, id: source_id },
    ]),
  )
  problems.push(
    problemOf("earlier_month_evidence_missing", [
      ...missingFees.map((id) => ({
        kind: "service_fee_month" as const,
        id,
      })),
      ...earlierSources.values(),
    ]),
  )
  return assembleStatementHeader({
    lifecycle: isCurrent ? "provisional" : "closed",
    booked: booked.map((entry) => ({
      food_credit: exact(entry, "food_credit"),
      commission: exact(entry, "commission"),
      service_fee: exact(entry, "service_fee"),
      is_adjustment: entry.original_month !== entry.posting_month,
    })),
    service_fee: standing.status === "accrued" ? standing.amount : null,
    problems,
  })
}

export type StatementReadInput = {
  restaurant_id: string
  month: string
  limit: number
  offset: number
}

/**
 * One Restaurant month: its header and whole-month totals with one page of
 * entries, newest posting first. A future month, or one before the
 * Restaurant existed, has no statement.
 */
export async function readLiveStatement(
  container: MedusaContainer,
  input: Omit<StatementReadInput, "limit"> & { limit: number | null },
  now = new Date(),
  cutoff?: Date,
): Promise<StatementSnapshot> {
  if (!isCalendarMonth(input.month))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "statement_month_invalid",
      "statement_month_invalid",
    )
  const restaurant = await readRestaurant(container, input.restaurant_id)
  if (!statementMonths(restaurant.created_at, now).includes(input.month))
    throw statementNotFound()
  const context = await readFeeContext(container, restaurant, cutoff)
  const [header, [entries, count], monthBooked, zero] = await Promise.all([
    readHeader(container, context, input.month, now, cutoff),
    resolveFinance(container).listAndCountFinanceJournalEntries(
      {
        restaurant_id: restaurant.id,
        posting_month: input.month,
        ...(cutoff ? { posted_at: { $lt: cutoff } } : {}),
      },
      {
        skip: input.offset,
        take: input.limit,
        order: { posted_at: "DESC", id: "DESC" },
      },
    ),
    // Every entry of the month, for the day-by-day view.
    resolveFinance(container).listFinanceJournalEntries(
      {
        restaurant_id: restaurant.id,
        posting_month: input.month,
        ...(cutoff ? { posted_at: { $lt: cutoff } } : {}),
      },
      {
        select: [
          "posted_at",
          "kind",
          "funded_by",
          "original_month",
          "posting_month",
          "food_credit",
          "raw_food_credit",
          "commission",
          "raw_commission",
          "service_fee",
          "raw_service_fee",
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
        ...(cutoff ? { posted_at: { $lt: cutoff } } : {}),
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
      mtogo_funded_food_credits: mtogoFundedFoodCredits(
        header.totals.food_credits,
        monthBooked.map((entry) => ({
          food_credit: exact(entry, "food_credit"),
          funded_by: entry.funded_by,
          is_adjustment: entry.original_month !== entry.posting_month,
        })),
      ),
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
          service_fee: exact(entry, "service_fee"),
          kind: entry.kind,
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
          service_fee: exact(entry, "service_fee"),
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
