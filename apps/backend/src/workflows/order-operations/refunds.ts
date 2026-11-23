import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type { RefundOutcome } from "../../modules/order-operation/models/refund-obligation"
import type { RefundAttemptOutcome } from "../../modules/order-operation/models/refund-attempt"
import type { CancellationCategory } from "../../modules/order-operation/models/order-operation"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import {
  attemptFullRefund,
  logCancellationUpstreamFailure,
} from "./full-refund"
import { orderSettlementLock } from "./locks"
import {
  actorIdsOfType,
  decideRefundRetry,
  REFUND_NOT_FOUND,
  type RefundActor,
  type RefundFailureCode,
  toRefundActor,
} from "./refund-rules"

export type { RefundActor }

/** The refund statuses an operator still has to resolve. */
export const OPEN_REFUND_STATUSES = ["failed", "pending"] as const
export type OpenRefundStatus = (typeof OPEN_REFUND_STATUSES)[number]

/** One page of the Refunds page's list. */
export type ListOpenRefundsInput = {
  status: OpenRefundStatus[]
  limit: number
  offset: number
}

export type OperatorRefund = {
  order_id: string
  order_reference: number
  restaurant: { id: string; name: string | null }
  amount: number
  currency_code: string
  status: RefundOutcome
  /** The safe failure class, never provider text. */
  failure_code: RefundFailureCode | null
  attempt_count: number
  last_attempted_at: string | null
  /** When the refund became owed: the cancellation's commit. */
  owed_since: string
  cancellation: {
    category: CancellationCategory
    cancelled_at: string
    actor: RefundActor
    reason: string | null
  }
  attempts: {
    id: string
    attempted_at: string
    outcome: RefundAttemptOutcome
    failure_code: RefundFailureCode | null
    actor: RefundActor
  }[]
  available_actions: "retry"[]
}

type ObligationRow = {
  id: string
  order_id: string
  raw_amount: { value: string }
  currency_code: string
  status: RefundOutcome
  failure_code: RefundFailureCode | null
  attempt_count: number
  last_attempted_at: Date | null
  created_at: Date
}

/** The cancellation that owes the refund; committed with the obligation. */
type CancelledRecord = {
  order_id: string
  restaurant_id: string
  cancellation_category: CancellationCategory
  cancelled_at: Date
  cancelled_by: string
  cancellation_note: string | null
}

const toIso = (value: Date | string) => new Date(value).toISOString()

/**
 * A fact every obligation has by construction (its cancellation and its
 * Order); a missing one means the records disagree, which is a bug.
 */
function requireRecord<T>(found: Map<string, T>, order_id: string): T {
  const value = found.get(order_id)
  if (value === undefined)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "refund_records_inconsistent",
    )
  return value
}

/**
 * Names for the actor ids an attempt or cancellation records: operators from
 * the User module (full name, else email), staff from their Restaurant's
 * staff record. Customers stay unnamed; their Order already identifies them.
 */
async function findActorNames(container: MedusaContainer, ids: string[]) {
  const userIds = actorIdsOfType(ids, "user")
  const staffIds = actorIdsOfType(ids, "restaurant_staff")
  const [users, staff] = await Promise.all([
    userIds.length
      ? container
          .resolve(Modules.USER)
          .listUsers(
            { id: userIds },
            { select: ["id", "first_name", "last_name", "email"], take: null },
          )
      : [],
    staffIds.length
      ? container
          .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
          .listRestaurantStaffs(
            { id: staffIds },
            { select: ["id", "name"], take: null },
          )
      : [],
  ])
  return new Map<string, string>([
    ...users.map((user): [string, string] => [
      user.id,
      [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email,
    ]),
    ...staff.map(({ id, name }): [string, string] => [id, name]),
  ])
}

/**
 * The operator's view of the given obligations (#198), in their order: the
 * Order reference and Restaurant, the owed amount and status, how the Order
 * was cancelled and by whom, and the attempt history oldest first.
 */
async function describeRefunds(
  container: MedusaContainer,
  obligations: ObligationRow[],
): Promise<OperatorRefund[]> {
  if (!obligations.length) return []
  const order_ids = obligations.map(({ order_id }) => order_id)
  const service = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const [records, attempts, { data: orders }] = await Promise.all([
    service.listOrderOperations(
      { order_id: order_ids },
      {
        select: [
          "order_id",
          "restaurant_id",
          "cancellation_category",
          "cancelled_at",
          "cancelled_by",
          "cancellation_note",
        ],
        take: null,
      },
    ) as unknown as Promise<CancelledRecord[]>,
    service.listRefundAttempts(
      { order_id: order_ids },
      { order: { attempted_at: "ASC", id: "ASC" }, take: null },
    ),
    container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { id: order_ids },
    }),
  ])
  const [restaurants, names] = await Promise.all([
    container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listRestaurants(
        { id: [...new Set(records.map((r) => r.restaurant_id))] },
        { select: ["id", "name"], take: null },
      ),
    findActorNames(container, [
      ...attempts.map(({ attempted_by }) => attempted_by),
      ...records.map(({ cancelled_by }) => cancelled_by),
    ]),
  ])
  const restaurantNames = new Map(restaurants.map((r) => [r.id, r.name]))
  const cancellationByOrder = new Map(records.map((r) => [r.order_id, r]))
  const referenceByOrder = new Map(
    (orders as unknown as { id: string; display_id: number }[]).map((order) => [
      order.id,
      order.display_id,
    ]),
  )
  return obligations.map((obligation) => {
    const cancelled = requireRecord(cancellationByOrder, obligation.order_id)
    return {
      order_id: obligation.order_id,
      order_reference: requireRecord(referenceByOrder, obligation.order_id),
      restaurant: {
        id: cancelled.restaurant_id,
        // Restaurants are deactivated, never deleted; kept defensive anyway.
        name: restaurantNames.get(cancelled.restaurant_id) ?? null,
      },
      amount: Number(obligation.raw_amount.value),
      currency_code: obligation.currency_code,
      status: obligation.status,
      failure_code: obligation.failure_code,
      attempt_count: obligation.attempt_count,
      // Unset only while the first attempt has not started yet.
      last_attempted_at: obligation.last_attempted_at
        ? toIso(obligation.last_attempted_at)
        : null,
      owed_since: toIso(obligation.created_at),
      cancellation: {
        category: cancelled.cancellation_category,
        cancelled_at: toIso(cancelled.cancelled_at),
        actor: toRefundActor(cancelled.cancelled_by, names),
        reason: cancelled.cancellation_note,
      },
      attempts: attempts
        .filter(({ order_id }) => order_id === obligation.order_id)
        .map((attempt) => ({
          id: attempt.id,
          attempted_at: toIso(attempt.attempted_at),
          outcome: attempt.outcome,
          failure_code: attempt.failure_code as RefundFailureCode | null,
          actor: toRefundActor(attempt.attempted_by, names),
        })),
      available_actions: obligation.status === "failed" ? ["retry"] : [],
    }
  })
}

const OBLIGATION_FIELDS = [
  "id",
  "order_id",
  "amount",
  "raw_amount",
  "currency_code",
  "status",
  "failure_code",
  "attempt_count",
  "last_attempted_at",
  "created_at",
]

/**
 * The Refunds page (#198): open full refunds, failed before pending (the
 * enum's text order) and the longest owed first within each, one bounded
 * page at a time from the `(status, created_at, id)` index.
 */
export async function listOpenRefunds(
  container: MedusaContainer,
  input: ListOpenRefundsInput,
) {
  const [obligations, count] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listAndCountRefundObligations(
      { status: input.status },
      {
        select: OBLIGATION_FIELDS,
        order: { status: "ASC", created_at: "ASC", id: "ASC" },
        take: input.limit,
        skip: input.offset,
      },
    )
  return {
    refunds: await describeRefunds(
      container,
      obligations as unknown as ObligationRow[],
    ),
    count,
    limit: input.limit,
    offset: input.offset,
  }
}

async function readRefunds(container: MedusaContainer, order_id: string) {
  const obligations = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listRefundObligations({ order_id }, { select: OBLIGATION_FIELDS, take: 1 })
  return obligations as unknown as ObligationRow[]
}

/**
 * An operator retries a failed full refund (#198). Under the Order's
 * settlement lock, which every attempt holds, it re-reads the obligation and
 * decides with `decideRefundRetry`. A failed refund is set back to `pending`
 * and goes through the one existing attempt (`attemptFullRefund`), with the
 * stored amount and idempotency key, so a refund the provider already
 * persisted is recorded without contacting it and money refunded elsewhere
 * is never sent on top. The operator is the attempt's actor. A retry that
 * waited behind another finds it resolved and returns the current outcome.
 * Nothing is compensated: a recorded attempt is history. Should the attempt
 * itself throw, the obligation stays `pending` and the recovery sweep
 * resumes it, as for any interrupted settlement.
 */
export async function retryFullRefund(
  container: MedusaContainer,
  input: { order_id: string; actor_id: string },
): Promise<OperatorRefund> {
  const lock = orderSettlementLock(input.order_id)
  await container.resolve(Modules.LOCKING).execute(
    lock.key,
    async () => {
      const [found] = await readRefunds(container, input.order_id)
      const decision = decideRefundRetry(found)
      if (decision.action === "refuse")
        throw new MedusaError(
          decision.code === REFUND_NOT_FOUND
            ? MedusaError.Types.NOT_FOUND
            : MedusaError.Types.NOT_ALLOWED,
          decision.code,
        )
      if (decision.action === "current") return
      await container
        .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
        .updateRefundObligations({
          selector: { id: decision.obligation.id, status: "failed" },
          data: { status: "pending" },
        })
      await attemptFullRefund(container, {
        order_id: input.order_id,
        created_by: input.actor_id,
        attempted_by: input.actor_id,
      }).catch(() => logCancellationUpstreamFailure(container, input.order_id))
    },
    { timeout: lock.timeout, expire: lock.ttl },
  )
  const [refund] = await describeRefunds(
    container,
    await readRefunds(container, input.order_id),
  )
  return refund
}
