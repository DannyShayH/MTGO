import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import {
  commitPreAcceptanceCancellation,
  settleCancellation,
} from "../cancellation"
import { logRecoveryFailure } from "../recovery-log"
import { orderOperationLock } from "../locks"
import { SYSTEM_ACTOR } from "../rules"
import { expireUnassignedDelivery } from "../unassigned-cancellation"

/** How many Orders one sweep handles per kind of work; the rest wait a tick. */
export const RECOVERY_BATCH_SIZE = 50

export type RecoveryInput = {
  /** The server's processing time, as ISO text; defaults to now. */
  now?: string
}

export type RecoveryResult = {
  /** Orders this sweep cancelled because their deadline had passed. */
  expired: string[]
  /** Accepted Orders this sweep cancelled as still unassigned at their claim deadline (#162). */
  unassigned_expired: string[]
  /** Orders whose refund or native cancellation this sweep resumed. */
  resumed: string[]
}

async function expireDueOrder(
  container: MedusaContainer,
  order_id: string,
  now: Date,
) {
  const lock = orderOperationLock(order_id)
  const result = await container.resolve(Modules.LOCKING).execute(
    lock.key,
    () =>
      commitPreAcceptanceCancellation(container, {
        order_id,
        requested: "acceptance_timeout",
        actor: SYSTEM_ACTOR,
        note: null,
        now,
      }),
    { timeout: lock.timeout, expire: lock.ttl },
  )
  return result.outcome === "cancelled"
}

/**
 * One bounded recovery sweep (#144), found entirely from durable records:
 *
 * 1. Awaiting Orders whose deadline is at or before `now` receive the
 *    timeout cancellation and full-refund obligation through the shared
 *    engine, under the same Order lock and revision guard as acceptance, so a
 *    racing acceptance and the sweep cannot both win.
 * 2. Accepted work still unassigned at its claim deadline (acceptance plus
 *    thirty minutes, #162) is cancelled with its full-refund obligation and
 *    any prepared-food credit, under the same Order guard the claim takes,
 *    then settled. Its delivery ends as `cancelled` through the shared
 *    terminal boundary, so a processed deadline is never read again; work
 *    whose Order already ended by another path is only ended.
 * 3. Every cancelled Order with an unfinished settlement (native
 *    cancellation not recorded, or a refund still pending) is settled again.
 *    Settlement is idempotent and serialized per Order, and an explicit
 *    failed refund is left owed for the operator (#49).
 *
 * The cancellation records `now` as its processing time and never moves the
 * deadline, so recovery after downtime grants no new acceptance window. One
 * Order's failure is logged and left for the next sweep.
 *
 * There is no compensation, as for rejection: a committed cancellation is
 * authoritative, and settlement only records outcomes it has verified.
 */
export const recoverOrderOperationsStep = createStep(
  "recover-order-operations",
  async (input: RecoveryInput, { container }) => {
    const now = input.now ? new Date(input.now) : new Date()
    const take = RECOVERY_BATCH_SIZE
    const service = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    const due = await service.listOrderOperations(
      {
        state: "awaiting_acceptance",
        acceptance_deadline: { $lte: now },
      },
      {
        select: ["order_id"],
        take,
        order: { acceptance_deadline: "ASC", id: "ASC" },
      },
    )
    const expired: string[] = []
    for (const { order_id } of due) {
      try {
        if (await expireDueOrder(container, order_id, now))
          expired.push(order_id)
      } catch (error) {
        logRecoveryFailure(container, order_id, error)
      }
    }
    const unassignedDue = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        {
          assigned_agent_id: null,
          terminal_outcome: null,
          claim_deadline: { $lte: now },
        },
        {
          select: ["order_id"],
          take,
          order: { claim_deadline: "ASC", id: "ASC" },
        },
      )
    const unassigned_expired: string[] = []
    for (const { order_id } of unassignedDue) {
      try {
        const commit = await expireUnassignedDelivery(container, order_id, now)
        if (commit.outcome === "cancelled") unassigned_expired.push(order_id)
      } catch (error) {
        logRecoveryFailure(container, order_id, error)
      }
    }
    const unsynchronized = await service.listOrderOperations(
      { state: "cancelled", native_cancelled_at: null },
      { select: ["order_id"], take, order: { cancelled_at: "ASC", id: "ASC" } },
    )
    const pendingRefunds = await service.listRefundObligations(
      { status: "pending" },
      // Least recently touched first: every attempt updates the row, so one
      // that stays in progress moves to the back and cannot starve
      // obligations never attempted (whose `last_attempted_at` is null).
      {
        select: ["order_id"],
        take,
        order: { updated_at: "ASC", id: "ASC" },
      },
    )
    const unsettled = [
      ...new Set([
        ...expired,
        ...unsynchronized.map(({ order_id }) => order_id),
        ...pendingRefunds.map(({ order_id }) => order_id),
      ]),
    ].filter((order_id) => !unassigned_expired.includes(order_id))
    for (const order_id of unsettled)
      await settleCancellation(container, order_id, SYSTEM_ACTOR)
    return new StepResponse<RecoveryResult>({
      expired,
      unassigned_expired,
      resumed: unsettled,
    })
  },
)
