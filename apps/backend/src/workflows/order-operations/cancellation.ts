import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import type {
  CancellationCategory,
  OrderOperationState,
} from "../../modules/order-operation/models/order-operation"
import {
  decideCancellation,
  type CancellationDecision,
  SYSTEM_ACTOR,
} from "./rules"
import { owedFullRefund, type PaymentFacts } from "./refund-rules"
import {
  attemptFullRefund,
  logCancellationUpstreamFailure,
} from "./full-refund"
import { syncNativeOrderCancellationWorkflow } from "./native-cancellation"
import { orderSettlementLock } from "./locks"
import { logRecoveryFailure } from "./recovery-log"

/**
 * The one cancellation and refund engine (#143, #144). Staff rejection and
 * the acceptance-timeout recovery commit through
 * `commitPreAcceptanceCancellation` and carry out the effects through
 * `settleCancellation`; nothing else owes or attempts a full refund. The
 * categories already include `customer_cancelled` for the Customer
 * cancellation slice, which is to use the same two functions.
 */

type GuardedRecord = {
  id: string
  state: OrderOperationState
  acceptance_deadline: Date | null
  accepted_at: Date | null
  revision: number
}

export type CancellationRequest = {
  order_id: string
  /** Staff scope: a record outside it is not found. Omitted for the system. */
  restaurant_id?: string
  requested: CancellationCategory
  /** Whoever asked; a timeout is always recorded as the system's. */
  actor: string
  note: string | null
  /** The server's processing time, which the cancellation records. */
  now: Date
}

export type CancellationCommit =
  | { outcome: "not_found" }
  | Exclude<CancellationDecision, { outcome: "cancel" }>
  | { outcome: "changed" }
  | {
      outcome: "cancelled"
      category: CancellationCategory
      cancelled_by: string
    }

/** The Order's payments as Query reads them, reduced to what is owed. */
async function owedRefund(container: MedusaContainer, order_id: string) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: [
        "id",
        "payment_collections.payments.id",
        "payment_collections.payments.currency_code",
        "payment_collections.payments.captures.raw_amount",
        "payment_collections.payments.refunds.raw_amount",
      ],
      filters: { id: order_id },
    })
  const order = data[0] as unknown as
    { payment_collections?: { payments?: PaymentFacts[] }[] } | undefined
  return owedFullRefund(
    (order?.payment_collections ?? []).flatMap(
      ({ payments }) => payments ?? [],
    ),
  )
}

/**
 * The guarded cancellation transition, to be run under the Order's lock. It
 * re-reads the record and decides at `now` with the shared expiry rule: at
 * or after the deadline the Order receives the timeout outcome, whoever
 * asked. Cancellation, actor, category, note and the full-refund obligation
 * commit in one transaction before any provider is contacted. A recorded
 * cancellation is the current outcome for a repeat.
 *
 * There is deliberately no compensation: once committed, the cancellation is
 * authoritative and nothing that follows may reactivate the Order.
 */
export async function commitPreAcceptanceCancellation(
  container: MedusaContainer,
  request: CancellationRequest,
): Promise<CancellationCommit> {
  const service = container.resolve<OrderOperationModuleService>(
    ORDER_OPERATION_MODULE,
  )
  const [record] = (await service.listOrderOperations(
    {
      order_id: request.order_id,
      ...(request.restaurant_id && { restaurant_id: request.restaurant_id }),
    },
    {
      select: ["id", "state", "acceptance_deadline", "accepted_at", "revision"],
      take: 1,
    },
  )) as unknown as GuardedRecord[]
  if (!record) return { outcome: "not_found" }
  const decision = decideCancellation(record, request.requested, request.now)
  if (decision.outcome !== "cancel") return decision
  // A timeout is the system's outcome, with no note.
  const actor =
    decision.category === "acceptance_timeout"
      ? { cancelled_by: SYSTEM_ACTOR, note: null }
      : { cancelled_by: request.actor, note: request.note }
  const committed = await service.cancelWithRefundObligation({
    id: record.id,
    order_id: request.order_id,
    revision: record.revision,
    cancelled_at: request.now,
    cancelled_by: actor.cancelled_by,
    category: decision.category,
    note: actor.note,
    refund: await owedRefund(container, request.order_id),
  })
  if (!committed) return { outcome: "changed" }
  return {
    outcome: "cancelled",
    category: decision.category,
    cancelled_by: actor.cancelled_by,
  }
}

export type Settlement = {
  refund: Awaited<ReturnType<typeof attemptFullRefund>> | "pending"
  native_cancellation: "synchronized" | "pending"
}

/**
 * Carries out a committed cancellation's effects: first the owed full refund,
 * then native Medusa cancellation, in the same order as Medusa's own
 * `cancelOrderWorkflow`, since recording a refund recomputes the payment
 * collection's status. It never throws and neither result can undo the
 * cancellation: a refund outcome is recorded on its obligation, and an
 * interrupted native synchronization stays repairable from the record
 * (`native_cancelled_at` unset). Both parts are idempotent and run under the
 * Order's settlement lock, so the request that cancelled and the recovery
 * sweep (#144) can both call this without duplicate effects.
 */
export async function settleCancellation(
  container: MedusaContainer,
  order_id: string,
): Promise<Settlement> {
  const settle = async (): Promise<Settlement> => {
    const [record] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id, state: "cancelled" },
        { select: ["cancelled_by"], take: 1 },
      )
    // The refund is credited to whoever the cancellation records.
    const created_by = record?.cancelled_by ?? SYSTEM_ACTOR
    const refund = await attemptFullRefund(container, {
      order_id,
      created_by,
    }).catch(() => {
      logCancellationUpstreamFailure(container, order_id)
      return "pending" as const
    })
    let native: Settlement["native_cancellation"] = "synchronized"
    try {
      await syncNativeOrderCancellationWorkflow(container).run({
        input: { order_id },
      })
    } catch {
      native = "pending"
      logCancellationUpstreamFailure(container, order_id)
    }
    return { refund, native_cancellation: native }
  }
  const lock = orderSettlementLock(order_id)
  try {
    return await container
      .resolve(Modules.LOCKING)
      .execute(lock.key, settle, { timeout: lock.timeout, expire: lock.ttl })
  } catch (error) {
    // Not an upstream failure: the lock was held too long or the record
    // could not be read. The durable record is unchanged, so the next sweep
    // resumes the settlement.
    logRecoveryFailure(container, order_id, error)
    return { refund: "pending", native_cancellation: "pending" }
  }
}
