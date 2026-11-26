import { createLogRecord } from "@dtc/logging"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import { copenhagenMonthOf } from "./calculation"
import { readParticipation } from "./participation"
import { closeRestaurantStatements } from "./closure"
import { restaurantFinanceLock } from "./locks"
import { serviceFeeEvidence, serviceFeeStanding } from "./service-fee"

/** How many Restaurants the accrual sweep reads per page. */
export const SERVICE_FEE_PAGE_SIZE = 200
/** How many owed accruals one sweep performs; the rest wait a tick. */
export const SERVICE_FEE_BATCH_SIZE = 50

export type ServiceFeeAccrualOutcome =
  | "accrued"
  | "unchanged"
  /** No active date this month: a verified zero needs no obligation. */
  | "not_owed"
  /** History cannot establish the month's active dates. */
  | "evidence_missing"
  | "pending"

/**
 * Accrues the current month's service fee of one Restaurant (#228; spec
 * #52 §6): its active Copenhagen dates so far, including today, and the
 * monthly amount rounded once from them, into the month's one obligation.
 * The month is decided by the server clock inside the Restaurant's finance
 * guard, so an accrual that waited over midnight never writes into the
 * month that ended; an ended month is never accrued again (#230 adjusts).
 * Missing participation evidence accrues nothing: the statement withholds
 * the fee rather than guessing from today's active flag.
 *
 * Owed work after a committed participation change (ADR-0021): it never
 * fails that change. A failure is logged and the once-per-minute recovery
 * accrues it from the durable history.
 */
export async function accrueServiceFee(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<ServiceFeeAccrualOutcome> {
  try {
    const finance = container.resolve<RestaurantFinanceModuleService>(
      RESTAURANT_FINANCE_MODULE,
    )
    await closeRestaurantStatements(container, restaurant_id)
    const lock = restaurantFinanceLock(restaurant_id)
    return await container.resolve(Modules.LOCKING).execute(
      lock.key,
      async (): Promise<ServiceFeeAccrualOutcome> => {
        const now = new Date()
        const month = copenhagenMonthOf(now)
        const facts = (await readParticipation(container, [restaurant_id])).get(
          restaurant_id,
        )
        if (!facts) return "not_owed"
        const evidence = serviceFeeEvidence(facts, month, now)
        if (evidence.status === "evidence_missing") return "evidence_missing"
        if (!evidence.active_dates.length) {
          // A verified zero needs no obligation, but corrects one that
          // holds dates the history no longer shows.
          const [held] = await finance.listFinanceServiceFees(
            { restaurant_id, month },
            { take: 1, select: ["id"] },
          )
          if (!held) return "not_owed"
        }
        const result = await finance.accrueServiceFee({
          restaurant_id,
          month,
          terms_version: evidence.terms_version,
          currency_code: "dkk",
          policy_amount: evidence.policy_amount,
          amount: evidence.amount,
          month_day_count: evidence.month_day_count,
          active_dates: evidence.active_dates,
          accrued_at: now,
        })
        return result.outcome
      },
      { timeout: lock.timeout, expire: lock.ttl },
    )
  } catch (error) {
    const record = createLogRecord("backend", "request.failed", {
      restaurant_id,
      err: error,
    })
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .log(record.level, record.msg, record)
    return "pending"
  }
}

/**
 * Accrues the fee right after an activation or deactivation committed and
 * released the Restaurant's lock, so the two guards never nest. Owed work
 * with no compensation (ADR-0021); see `accrueServiceFee`.
 */
export const accrueServiceFeeStep = createStep(
  "accrue-service-fee",
  async (input: { restaurant_id: string }, { container }) => {
    await accrueServiceFee(container, input.restaurant_id)
    return new StepResponse(undefined)
  },
)

/**
 * One accrual sweep (spec #52 §9): every Restaurant, page by page, whose
 * current-month obligation differs from the active dates its history shows,
 * such as a new day that began at midnight or an accrual the participation
 * change could not finish. At most `batch` accruals run per sweep; the next tick
 * resumes from durable state.
 */
export async function sweepServiceFees(
  container: MedusaContainer,
  batch: number,
) {
  const restaurants =
    container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const finance = container.resolve<RestaurantFinanceModuleService>(
    RESTAURANT_FINANCE_MODULE,
  )
  const outcomes: Record<string, ServiceFeeAccrualOutcome> = {}
  let remaining = batch
  let page = 0
  while (remaining > 0) {
    const listed = await restaurants.listRestaurants(
      {},
      {
        select: ["id"],
        skip: page * SERVICE_FEE_PAGE_SIZE,
        take: SERVICE_FEE_PAGE_SIZE,
        order: { id: "ASC" },
      },
    )
    const ids = listed.map(({ id }) => id)
    const now = new Date()
    const month = copenhagenMonthOf(now)
    const participation = await readParticipation(container, ids)
    const accrued = ids.length
      ? await finance.listFinanceServiceFees(
          { restaurant_id: ids, month },
          { select: ["restaurant_id", "active_dates"], take: null },
        )
      : []
    const accruedOf = new Map(
      accrued.map((fee) => [
        fee.restaurant_id,
        { active_dates: fee.active_dates, amount: "" },
      ]),
    )
    const owed = ids.filter((id) => {
      const facts = participation.get(id)
      return (
        facts !== undefined &&
        serviceFeeStanding(
          serviceFeeEvidence(facts, month, now),
          accruedOf.get(id),
        ).status === "accrual_pending"
      )
    })
    for (const id of owed.slice(0, remaining))
      outcomes[id] = await accrueServiceFee(container, id)
    remaining -= Math.min(owed.length, remaining)
    if (listed.length < SERVICE_FEE_PAGE_SIZE) break
    page += 1
  }
  return outcomes
}

const accrueServiceFeesStep = createStep(
  "accrue-service-fees",
  async (_input: Record<string, never>, { container }) =>
    new StepResponse({
      outcomes: await sweepServiceFees(container, SERVICE_FEE_BATCH_SIZE),
    }),
)

/**
 * The once-per-minute fee accrual (#228), run by the
 * `recover-restaurant-finance` job beside handover recognition but
 * independently of it, so one failing never skips the other.
 */
export const accrueServiceFeesWorkflow = createWorkflow(
  "accrue-service-fees",
  function (input: Record<string, never>) {
    return new WorkflowResponse(accrueServiceFeesStep(input))
  },
)
