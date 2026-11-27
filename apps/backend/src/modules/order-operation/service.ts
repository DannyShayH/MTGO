import type { EntityManager } from "@medusajs/framework/mikro-orm/postgresql"
import type { Context } from "@medusajs/framework/types"
import {
  BigNumber,
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import OrderOperation, {
  type CancellationCategory,
  type OrderOperationState,
} from "./models/order-operation"
import FoodCredit from "./models/food-credit"
import PurchaseReview from "./models/purchase-review"
import RefundObligation, {
  type RefundOutcome,
} from "./models/refund-obligation"
import RefundAttempt, {
  type RefundAttemptOutcome,
} from "./models/refund-attempt"

/**
 * Where an Open Order is (#259), in the order work moves through them. A
 * pickup is only ever recorded for ready food, and an agent assigned while
 * the kitchen still works counts with the kitchen.
 */
export const OPEN_ORDER_STAGES = [
  "awaiting_acceptance",
  "accepted_or_preparing",
  "ready_unassigned",
  "assigned_not_picked_up",
  "picked_up",
] as const
export type OpenOrderStage = (typeof OPEN_ORDER_STAGES)[number]

/**
 * The stage rule, evaluated in the database so one grouped query counts
 * every stage: pickup first (only ever recorded for ready food), then the
 * kitchen state, then the copied assignment.
 */
const OPEN_ORDER_STAGE_SQL = `case
  when o.delivery_picked_up_at is not null then 'picked_up'
  when o.state = 'awaiting_acceptance' then 'awaiting_acceptance'
  when o.state in ('accepted', 'preparing') then 'accepted_or_preparing'
  when o.delivery_assigned_at is null then 'ready_unassigned'
  else 'assigned_not_picked_up'
end`

export type CancellationCommand = {
  /** The record and the revision and state the caller decided on. */
  id: string
  order_id: string
  revision: number
  /** The state the decision was made in, repeated by the guarded write. */
  state: OrderOperationState
  cancelled_at: Date
  cancelled_by: string
  category: CancellationCategory
  note: string | null
  /** The full refund owed, or null when nothing was captured. */
  refund: {
    payment_id: string
    /** Medusa monetary value as a decimal string, never float arithmetic. */
    amount: string
    currency_code: string
  } | null
  /** The prepared-food credit owed with this cancellation (#162), if any. */
  food_credit?: {
    restaurant_id: string
    /** Exact decimal string, excluding VAT. */
    amount: string
    currency_code: string
    reason: CancellationCategory
    preparation_started_at: Date
    ready_at: Date | null
  } | null
}

export type RefundAttemptRecord = {
  /** The obligation and the outcome the attempt leaves on it. */
  obligation: {
    id: string
    status: RefundOutcome
    failure_code: string | null
    refund_id?: string
    succeeded_at?: Date
  }
  /** The history entry: when, by whom and how it ended. */
  attempt: {
    order_id: string
    attempted_at: Date
    attempted_by: string
    outcome: RefundAttemptOutcome
    failure_code: string | null
  }
}

class OrderOperationModuleService extends MedusaService({
  OrderOperation,
  PurchaseReview,
  RefundObligation,
  RefundAttempt,
  FoodCredit,
}) {
  /**
   * Counts Open Orders by stage in the database (#259): Orders not cancelled
   * and without a delivery outcome, with or without a placement time. One
   * grouped query gives every stage, so the stages always add up to the
   * total. Every stage is returned, zero when nothing is in it.
   */
  @InjectManager()
  async countOpenOrdersByStage(
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<Record<OpenOrderStage, number>> {
    const manager = context.manager as EntityManager
    const open = manager
      .createQueryBuilder("OrderOperation", "o")
      .where({
        state: { $ne: "cancelled" },
        delivery_outcome: null,
        ...(scope.restaurant_id && { restaurant_id: scope.restaurant_id }),
        deleted_at: null,
      })
      .getKnexQuery()
    const rows = (await open
      .clearSelect()
      .select(manager.getKnex().raw(`${OPEN_ORDER_STAGE_SQL} as stage`))
      .count({ count: "o.id" })
      .groupBy("stage")) as unknown as { stage: string; count: string }[]
    const counts = Object.fromEntries(
      OPEN_ORDER_STAGES.map((stage) => [stage, 0]),
    ) as Record<OpenOrderStage, number>
    for (const { stage, count } of rows)
      counts[stage as OpenOrderStage] = Number(count)
    return counts
  }

  /**
   * Counts Full refunds still owed (#260), pending apart from failed, in one
   * query; succeeded refunds are resolved and left out. One Restaurant's are
   * found through its Orders' operation records in this module.
   */
  @InjectManager()
  async countUnresolvedFullRefunds(
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<{ pending: number; failed: number }> {
    const manager = context.manager as EntityManager
    const knex = manager.getKnex()
    const query = knex("refund_obligation as r")
      .whereIn("r.status", ["pending", "failed"])
      .whereNull("r.deleted_at")
      .select(
        knex.raw("count(*) filter (where r.status = 'pending') as pending"),
        knex.raw("count(*) filter (where r.status = 'failed') as failed"),
      )
    if (scope.restaurant_id)
      query
        .join("order_operation as o", "o.order_id", "r.order_id")
        .whereNull("o.deleted_at")
        .where("o.restaurant_id", scope.restaurant_id)
    const [row] = (await query) as { pending: string; failed: string }[]
    return { pending: Number(row.pending), failed: Number(row.failed) }
  }

  /**
   * Records how a refund attempt ended (#197): the outcome on the obligation
   * and one new history entry, in one transaction, so the history never
   * claims an outcome the obligation does not show. Entries are only ever
   * created; nothing in this module updates or deletes one.
   */
  @InjectManager()
  @InjectTransactionManager()
  async recordRefundAttempt(
    record: RefundAttemptRecord,
    @MedusaContext() context: Context = {},
  ): Promise<void> {
    await this.updateRefundObligations(record.obligation, context)
    await this.createRefundAttempts(
      { refund_obligation_id: record.obligation.id, ...record.attempt },
      context,
    )
  }

  /**
   * Commits a business cancellation, its full-refund obligation and any
   * prepared-food credit together (#143, #162), before any provider is
   * contacted. The update's selector repeats the revision and state the
   * caller read, so a stale decision writes nothing and returns false. The
   * unique `order_id` of each obligation keeps a second cancellation from
   * owing a second refund or credit.
   */
  @InjectManager()
  @InjectTransactionManager()
  async cancelWithRefundObligation(
    command: CancellationCommand,
    @MedusaContext() context: Context = {},
  ): Promise<boolean> {
    const updated = await this.updateOrderOperations(
      {
        selector: {
          id: command.id,
          revision: command.revision,
          state: command.state,
        },
        data: {
          state: "cancelled",
          cancelled_at: command.cancelled_at,
          cancelled_by: command.cancelled_by,
          cancellation_category: command.category,
          cancellation_note: command.note,
          revision: command.revision + 1,
        },
      },
      context,
    )
    if (!updated.length) return false
    if (command.refund)
      await this.createRefundObligations(
        {
          order_id: command.order_id,
          payment_id: command.refund.payment_id,
          // Exact decimal: the generated input type says `number`, but a
          // bigNumber property stores a BigNumber without float rounding.
          amount: new BigNumber(command.refund.amount) as unknown as number,
          currency_code: command.refund.currency_code,
          // Stable for the Order's one obligation: every attempt sends it.
          idempotency_key: `mtogo-full-refund:${command.order_id}`,
        },
        context,
      )
    if (command.food_credit)
      await this.createFoodCredits(
        {
          order_id: command.order_id,
          ...command.food_credit,
          amount: new BigNumber(
            command.food_credit.amount,
          ) as unknown as number,
          commission_amount: new BigNumber(0) as unknown as number,
          funded_by: "mtogo",
        },
        context,
      )
    return true
  }
}

export default OrderOperationModuleService
