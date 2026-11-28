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
  type DeliveryOutcome,
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

/** A range of time: from `starts_at`, inclusive, to `ends_at`, exclusive. */
export type PlacementPeriod = { starts_at: string; ends_at: string }

/**
 * How a placed Order stands now (#263): cancelled by a category, ended by
 * its delivery outcome, or still open.
 */
export type PlacementOutcome = CancellationCategory | DeliveryOutcome | "open"

/**
 * The outcome rule, evaluated in the database so one grouped query counts
 * all. A cancelled record always has a category: its one write,
 * `cancelWithRefundObligation`, sets both together.
 */
const PLACEMENT_OUTCOME_SQL = `case
  when o.state = 'cancelled' then o.cancellation_category
  when o.delivery_outcome is not null then o.delivery_outcome
  else 'open'
end`

/** Order processing time as the database averages it (#262). */
export type ProcessingTimeCounts = {
  /** Orders handed over in the period with a placement time. */
  included: number
  /** Their average from placement to handover, null when none is included. */
  average_seconds: number | null
  /** Orders handed over in the period without a placement time (legacy). */
  no_placement_time: number
  /** Orders delivered without a handover time, placed in the period. */
  no_handover_time: number
}

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

/** A database average as a number; no rows averaged is no average. */
const averageOrNull = (value: string | null) =>
  value === null ? null : Number(value)

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
   * The Orders placed in a period, from `starts_at` inclusive to `ends_at`
   * exclusive, as a query each placement count groups differently (#261).
   * Selected by placement time alone, so the placement-time index serves it.
   */
  private placementsIn(
    manager: EntityManager,
    period: PlacementPeriod,
    scope: { restaurant_id?: string },
  ) {
    const query = manager
      .getKnex()("order_operation as o")
      .whereNull("o.deleted_at")
      .where("o.placed_at", ">=", new Date(period.starts_at))
      .where("o.placed_at", "<", new Date(period.ends_at))
    if (scope.restaurant_id) query.where("o.restaurant_id", scope.restaurant_id)
    return query
  }

  /**
   * Counts the Orders placed in a period by the cancellation category they
   * now have (#261), null for those not cancelled, so the volume and its
   * cancellations come from one grouped query.
   */
  @InjectManager()
  async countPlacementsByCancellation(
    period: PlacementPeriod,
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<{ category: CancellationCategory | null; count: number }[]> {
    const manager = context.manager as EntityManager
    const rows = (await this.placementsIn(manager, period, scope)
      .select(
        manager
          .getKnex()
          .raw(
            "case when o.state = 'cancelled' then o.cancellation_category end as category",
          ),
      )
      .count({ count: "*" })
      .groupBy("category")) as { category: string | null; count: string }[]
    return rows.map(({ category, count }) => ({
      category: category as CancellationCategory | null,
      count: Number(count),
    }))
  }

  /**
   * Counts the Orders placed in a period by the hour they were placed in
   * (#261), as each hour's start. Hours are counted on the UTC clock:
   * Copenhagen's offset is whole hours, so each is one Copenhagen clock hour,
   * and the repeated hour when the clocks go back stays two hours.
   */
  @InjectManager()
  async countPlacementsByHour(
    period: PlacementPeriod,
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<{ starts_at: string; count: number }[]> {
    const manager = context.manager as EntityManager
    const rows = (await this.placementsIn(manager, period, scope)
      .select(
        manager
          .getKnex()
          .raw("floor(extract(epoch from o.placed_at) / 3600)::bigint as hour"),
      )
      .count({ count: "*" })
      .groupBy("hour")) as { hour: string; count: string }[]
    return rows.map(({ hour, count }) => ({
      starts_at: new Date(Number(hour) * 3600 * 1000).toISOString(),
      count: Number(count),
    }))
  }

  /**
   * Counts the Orders placed in a period by their Copenhagen calendar date
   * (#261), as `YYYY-MM-DD`, whatever the database session's time zone.
   */
  @InjectManager()
  async countPlacementsByCopenhagenDate(
    period: PlacementPeriod,
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<{ date: string; count: number }[]> {
    const manager = context.manager as EntityManager
    const rows = (await this.placementsIn(manager, period, scope)
      .select(
        manager
          .getKnex()
          .raw(
            "to_char(o.placed_at at time zone 'Europe/Copenhagen', 'YYYY-MM-DD') as date",
          ),
      )
      .count({ count: "*" })
      .groupBy("date")) as { date: string; count: string }[]
    return rows.map(({ date, count }) => ({ date, count: Number(count) }))
  }

  /**
   * Counts the Orders placed in a period by how they stand now (#263): the
   * cancellation category of a cancelled Order (which wins over a delivery
   * that then ended `not_delivered`), else the delivery outcome, else
   * `open`. One grouped query, so the Unfulfilled Orders, their causes, the
   * delivered and the still-open Orders always add up to the placements.
   */
  @InjectManager()
  async countPlacementsByOutcome(
    period: PlacementPeriod,
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<{ outcome: PlacementOutcome; count: number }[]> {
    const manager = context.manager as EntityManager
    const rows = (await this.placementsIn(manager, period, scope)
      .select(manager.getKnex().raw(`${PLACEMENT_OUTCOME_SQL} as outcome`))
      .count({ count: "*" })
      .groupBy("outcome")) as { outcome: string; count: string }[]
    return rows.map(({ outcome, count }) => ({
      outcome: outcome as PlacementOutcome,
      count: Number(count),
    }))
  }

  /** Delivered records, not deleted, optionally of one Restaurant (#262). */
  private delivered(manager: EntityManager, scope: { restaurant_id?: string }) {
    const query = manager
      .getKnex()("order_operation as o")
      .whereNull("o.deleted_at")
      .where("o.delivery_outcome", "delivered")
    if (scope.restaurant_id) query.where("o.restaurant_id", scope.restaurant_id)
    return query
  }

  /**
   * Delivered records handed over in a period, from `starts_at` inclusive to
   * `ends_at` exclusive, with the placement-to-handover columns each
   * processing-time read groups differently (#262). Selected by handover
   * time alone, so the delivery-end-time index serves it.
   */
  private handedOverIn(
    manager: EntityManager,
    period: PlacementPeriod,
    scope: { restaurant_id?: string },
  ) {
    const knex = manager.getKnex()
    return this.delivered(manager, scope)
      .where("o.delivery_ended_at", ">=", new Date(period.starts_at))
      .where("o.delivery_ended_at", "<", new Date(period.ends_at))
      .select(
        knex.raw("count(o.placed_at) as included"),
        knex.raw(
          "avg(extract(epoch from o.delivery_ended_at - o.placed_at)) as average_seconds",
        ),
      )
  }

  /**
   * Averages Order processing time in the database (#262): from `placed_at`
   * to the copied handover time, for Orders delivered with a handover time
   * in the period (selected by handover time, so the delivery-end-time index
   * serves it). Cancelled and not-delivered Orders are never in it. Missing
   * data is counted by reason, never averaged as zero: a handed-over Order
   * without a placement time (legacy), and a delivered Order without a
   * handover time, which can only be placed in the period by its placement.
   */
  @InjectManager()
  async averageProcessingTime(
    period: PlacementPeriod,
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<ProcessingTimeCounts> {
    const manager = context.manager as EntityManager
    const [handedOver] = (await this.handedOverIn(
      manager,
      period,
      scope,
    ).select(
      manager
        .getKnex()
        .raw(
          "count(*) filter (where o.placed_at is null) as no_placement_time",
        ),
    )) as {
      included: string
      average_seconds: string | null
      no_placement_time: string
    }[]
    const [withoutHandover] = (await this.delivered(manager, scope)
      .whereNull("o.delivery_ended_at")
      .where("o.placed_at", ">=", new Date(period.starts_at))
      .where("o.placed_at", "<", new Date(period.ends_at))
      .count({ count: "*" })) as { count: string }[]
    return {
      included: Number(handedOver.included),
      average_seconds: averageOrNull(handedOver.average_seconds),
      no_placement_time: Number(handedOver.no_placement_time),
      no_handover_time: Number(withoutHandover.count),
    }
  }

  /**
   * Averages Order processing time per Copenhagen calendar date of the
   * handover (#262), as `YYYY-MM-DD`, for the seven-day trend. A date without
   * handovers is absent; exclusions are counted once for the whole period by
   * `averageProcessingTime`.
   */
  @InjectManager()
  async averageProcessingTimeByCopenhagenDate(
    period: PlacementPeriod,
    scope: { restaurant_id?: string } = {},
    @MedusaContext() context: Context = {},
  ): Promise<
    { date: string; included: number; average_seconds: number | null }[]
  > {
    const manager = context.manager as EntityManager
    const rows = (await this.handedOverIn(manager, period, scope)
      .select(
        manager
          .getKnex()
          .raw(
            "to_char(o.delivery_ended_at at time zone 'Europe/Copenhagen', 'YYYY-MM-DD') as date",
          ),
      )
      .groupBy("date")) as {
      date: string
      included: string
      average_seconds: string | null
    }[]
    return rows.map((row) => ({
      date: row.date,
      included: Number(row.included),
      average_seconds: averageOrNull(row.average_seconds),
    }))
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
