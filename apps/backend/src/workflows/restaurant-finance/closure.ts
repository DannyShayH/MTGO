import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MathBN, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { RESTAURANT_FINANCE_MODULE } from "../../modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../modules/restaurant-finance/service"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
  exactAmount,
  payloadDigest,
} from "./calculation"
import { restaurantFinanceLock } from "./locks"
import { readLiveStatement } from "./statement-read"
import { statementMonths } from "./statement-rules"
import { readParticipation } from "./participation"
import { serviceFeeEvidence, serviceFeeDifference } from "./service-fee"

/**
 * Boundary materialization is owed work with no compensation (ADR-0021).
 * All members and accounted-for sources use the exclusive boundary cutoff,
 * so downtime never extends the old posting window. Called before recovery
 * can remove the old month's pending work from live source queries.
 */
export async function closeRestaurantStatements(
  container: MedusaContainer,
  restaurant_id: string,
) {
  const lock = restaurantFinanceLock(restaurant_id)
  await container.resolve(Modules.LOCKING).execute(
    lock.key,
    async () => {
      const now = new Date()
      const [restaurant] = await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .listRestaurants({ id: restaurant_id }, { take: 1, withDeleted: true })
      if (!restaurant) return
      const finance = container.resolve<RestaurantFinanceModuleService>(
        RESTAURANT_FINANCE_MODULE,
      )
      const closed = await finance.listFinanceClosures(
        { restaurant_id },
        { select: ["month"], take: null },
      )
      const held = new Set(closed.map(({ month }) => month))
      for (const month of statementMonths(
        restaurant.created_at,
        now,
      ).reverse()) {
        if (month === copenhagenMonthOf(now) || held.has(month)) continue
        const period = copenhagenMonthPeriod(month)
        const snapshot = await readLiveStatement(
          container,
          { restaurant_id, month, limit: null, offset: 0 },
          period.ends_at,
          period.ends_at,
        )
        await finance.closeStatement({
          restaurant_id,
          month,
          ...period,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
        })
      }
    },
    { timeout: lock.timeout, expire: lock.ttl },
  )
}

/** Independently rounded monthly target minus the frozen accrual and all prior differences. */
export async function reconcileClosedServiceFees(
  container: MedusaContainer,
  restaurant_id: string,
) {
  await closeRestaurantStatements(container, restaurant_id)
  const lock = restaurantFinanceLock(restaurant_id)
  await container.resolve(Modules.LOCKING).execute(
    lock.key,
    async () => {
      const now = new Date()
      const facts = (await readParticipation(container, [restaurant_id])).get(
        restaurant_id,
      )
      if (!facts) return
      const finance = container.resolve<RestaurantFinanceModuleService>(
        RESTAURANT_FINANCE_MODULE,
      )
      const closures = await finance.listFinanceClosures(
        { restaurant_id },
        { take: null, order: { month: "ASC" } },
      )
      for (const closure of closures) {
        const evidence = serviceFeeEvidence(facts, closure.month, now)
        if (evidence.status !== "verified") continue
        const [obligation] = await finance.listFinanceServiceFees(
          { restaurant_id, month: closure.month },
          { take: 1 },
        )
        const adjustments = await finance.listFinanceJournalEntries(
          {
            restaurant_id,
            original_month: closure.month,
            kind: "service_fee_difference",
          },
          { take: null, order: { posted_at: "DESC", id: "DESC" } },
        )
        const recognized = adjustments.reduce(
          (total, entry) =>
            MathBN.add(total, exactAmount(entry, "service_fee")),
          MathBN.convert(obligation ? exactAmount(obligation, "amount") : "0"),
        )
        const difference = serviceFeeDifference(evidence.amount, [
          recognized.toString(),
        ])
        if (MathBN.eq(difference, 0)) continue
        // Every recognized difference advances the source identity, even
        // when timestamps tie and generated IDs do not follow creation order.
        const recognizedReceiptIds = adjustments
          .map(({ receipt_id }) => receipt_id)
          .sort((a, b) => a.localeCompare(b))
        const source_id = `${restaurant_id}:${closure.month}:${payloadDigest(recognizedReceiptIds)}:${evidence.amount}`
        const calculation = {
          ...evidence,
          recognized_amount: recognized.toString(),
          recognized_receipt_ids: recognizedReceiptIds,
          difference,
          obligation_id: obligation?.id ?? null,
        }
        await finance.recognizeSource({
          receipt: {
            source_kind: "service_fee_difference",
            source_id,
            restaurant_id,
            order_id: null,
            outcome: "service_fee_difference",
            occurred_at: new Date(closure.ends_at.getTime() - 1),
            original_month: closure.month,
            posted_at: now,
            posting_month: copenhagenMonthOf(now),
            terms_version: evidence.terms_version,
            currency_code: "dkk",
            evidence: calculation,
            payload_digest: payloadDigest(calculation),
          },
          entry: {
            kind: "service_fee_difference",
            food_credit: "0",
            commission: "0",
            service_fee: difference,
            funded_by: "mtogo",
          },
        })
      }
    },
    { timeout: lock.timeout, expire: lock.ttl },
  )
}

/** Bounded Restaurant pages; durable closures and receipts make restart/replay safe. */
const closeStatementsStep = createStep(
  "close-statements",
  async (_input: Record<string, never>, { container }) => {
    const restaurants =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    let skip = 0
    for (;;) {
      const page = await restaurants.listRestaurants(
        {},
        {
          select: ["id"],
          skip,
          take: 50,
          order: { id: "ASC" },
          withDeleted: true,
        },
      )
      for (const { id } of page) await reconcileClosedServiceFees(container, id)
      if (page.length < 50) break
      skip += page.length
    }
    return new StepResponse(undefined)
  },
)

export const closeStatementsWorkflow = createWorkflow(
  "close-statements",
  function (input: Record<string, never>) {
    return new WorkflowResponse(closeStatementsStep(input))
  },
)
