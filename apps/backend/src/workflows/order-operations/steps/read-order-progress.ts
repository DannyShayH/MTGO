import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import type { TerminalOutcome } from "../../../modules/delivery/models/intended-delivery"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import type {
  CancellationCategory,
  OrderOperationState,
} from "../../../modules/order-operation/models/order-operation"
import {
  iso,
  cancellationOutcome,
  CancellationOutcome,
  refundOutcomesOf,
  RefundOutcomeView,
} from "../outcomes"
import { customerActions, type CustomerOrderAction } from "../rules"
import { orderNotFound } from "./read-restaurant-orders"
import {
  customerLocation,
  customerLocationSample,
} from "../../delivery/customer-location"
import { orderOperationLock } from "../locks"

type Row = {
  order_id: string
  state: OrderOperationState
  placed_at: Date | string | null
  accepted_at: Date | string | null
  preparation_started_at: Date | string | null
  ready_at: Date | string | null
  cancelled_at: Date | string | null
  cancellation_category: CancellationCategory | null
  acceptance_deadline: Date | string | null
}

/**
 * The committed delivery milestones (#161; spec #48 story 64), for #50's
 * timeline: responsibility, pickup and the terminal outcome. Who the agent
 * is, the retry identities and internal reasons are never part of it.
 * Null until a delivery exists, that is before acceptance.
 */
export type DeliveryProgress = {
  assigned_at: string | null
  picked_up_at: string | null
  /** The confirmed handover; only a delivered outcome has one. */
  delivered_at: string | null
  /** Recorded end time for any terminal delivery outcome. */
  ended_at: string | null
  outcome: TerminalOutcome | null
} | null

type Moment = Date | string | null

/** The delivery fields `deliveryProgressOf` reads. */
export const DELIVERY_PROGRESS_FIELDS = [
  "assigned_at",
  "picked_up_at",
  "terminal_outcome",
  "terminal_at",
]

/** The Customer's milestones of one delivery, shared with #166's delivery read. */
export function deliveryProgressOf(record: {
  assigned_at: Moment
  picked_up_at: Moment
  terminal_outcome: TerminalOutcome | null
  terminal_at: Moment
}): NonNullable<DeliveryProgress> {
  return {
    assigned_at: iso(record.assigned_at),
    picked_up_at: iso(record.picked_up_at),
    delivered_at:
      record.terminal_outcome === "delivered" ? iso(record.terminal_at) : null,
    ended_at: record.terminal_outcome ? iso(record.terminal_at) : null,
    outcome: record.terminal_outcome,
  }
}

/**
 * What the owning Customer sees of their Order's progress (#143): factual
 * milestones (placement, acceptance and, since #146, preparation start and
 * food readiness), the cancellation category and the refund outcome. Staff
 * identities and the internal rejection note are never part of it.
 */
export type OrderProgress = {
  order_id: string
  state: OrderOperationState
  placed_at: string | null
  accepted_at: string | null
  preparation_started_at: string | null
  ready_at: string | null
  /** What the Customer may do now, decided at the server's time (#145). */
  available_actions: CustomerOrderAction[]
  cancellation: CancellationOutcome
  refund: RefundOutcomeView
  delivery: DeliveryProgress
}

export type OrderProgressRead = { progress: OrderProgress; server_time: string }

/** The Order's current progress, read fresh from its durable record. */
export async function readOrderProgress(
  container: MedusaContainer,
  order_id: string,
): Promise<OrderProgressRead> {
  const [found] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id },
      {
        select: [
          "order_id",
          "state",
          "placed_at",
          "accepted_at",
          "preparation_started_at",
          "ready_at",
          "cancelled_at",
          "cancellation_category",
          "acceptance_deadline",
        ],
        take: 1,
      },
    )
  const row = found as unknown as Row | undefined
  if (!row) throw orderNotFound()
  const refunds = await refundOutcomesOf(container, [row.order_id])
  const [record] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      { order_id: row.order_id },
      {
        select: DELIVERY_PROGRESS_FIELDS,
        take: 1,
      },
    )
  const now = new Date()
  const progress: OrderProgress = {
    order_id: row.order_id,
    state: row.state,
    placed_at: iso(row.placed_at),
    accepted_at: iso(row.accepted_at),
    preparation_started_at: iso(row.preparation_started_at),
    ready_at: iso(row.ready_at),
    available_actions: customerActions(row, now),
    cancellation: cancellationOutcome(row),
    refund: refunds.get(row.order_id) ?? null,
    delivery: record ? deliveryProgressOf(record) : null,
  }
  return { progress, server_time: now.toISOString() }
}

export const readOrderProgressStep = createStep(
  "read-order-progress",
  async (input: { order_id: string }, { container }) =>
    new StepResponse(await readOrderProgress(container, input.order_id)),
)

/** Customer-safe identity and recorded food progress for tracking. */
export const readOrderTrackingStep = createStep(
  "read-order-tracking",
  async (input: { order_id: string }, { container }) => {
    const lock = orderOperationLock(input.order_id)
    const result = await container.resolve(Modules.LOCKING).execute(
      lock.key,
      async () => {
        const order = await container
          .resolve(Modules.ORDER)
          .retrieveOrder(input.order_id, {
            select: ["id", "metadata"],
          })
        const review = order.metadata?.mtogo_checkout_review as
          { order_language?: unknown } | undefined
        const language = review?.order_language === "en" ? "en" : "da"
        const progress = await readOrderProgress(container, input.order_id)
        const deliveryService =
          container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
        const [record] = await deliveryService.listIntendedDeliveries(
          { order_id: input.order_id },
          { select: DELIVERY_PROGRESS_FIELDS, take: 1 },
        )
        const sample = record
          ? await customerLocationSample(deliveryService, input.order_id)
          : null
        const now = new Date()
        const location = customerLocation(record ?? null, sample ?? null, now)
        const delivery = progress.progress.delivery && {
          ...progress.progress.delivery,
          location,
        }
        const { refund } = progress.progress
        const customerRefund = refund && {
          status: refund.status,
          amount_including_vat: refund.amount_including_vat,
          currency_code: refund.currency_code,
          succeeded_at: refund.succeeded_at,
        }
        const follow_up = {
          status:
            refund && refund.status !== "succeeded" ? "pending" : "unknown",
        }
        return {
          order: { id: order.id, language },
          ...progress,
          server_time: now.toISOString(),
          progress: {
            ...progress.progress,
            delivery,
            refund: customerRefund,
            follow_up,
          },
        }
      },
      { timeout: lock.timeout, expire: lock.ttl },
    )
    return new StepResponse(result)
  },
)
