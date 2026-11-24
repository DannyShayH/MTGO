import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type DeliveryModuleService from "../../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import type { CancellationCategory } from "../../../modules/order-operation/models/order-operation"
import type { TerminalOutcome } from "../../../modules/delivery/models/intended-delivery"
import { cancelByOperator } from "../operator-cancellation"
import {
  cancellationOutcome,
  foodCreditsOf,
  iso,
  refundOutcomesOf,
  type CancellationOutcome,
  type FoodCreditView,
  type RefundOutcomeView,
} from "../outcomes"
import { owedRefund } from "../cancellation"
import type { OperatorCancellationRequest } from "../operator-cancellation"
import { cancellationStepResponse } from "./cancellation-response"
import { orderNotFound as notFound } from "./read-restaurant-orders"

/**
 * The operator's guarded cancellation (#199) under the Order's lock. A
 * refusal is `NOT_ALLOWED` (400) with its code, a lost guarded write is
 * `order_changed` (409); a recorded cancellation is the current outcome for
 * a repeat, which settles nothing. No compensation: a committed cancellation
 * is authoritative (ADR-0021).
 */
export const commitOperatorCancellationStep = createStep(
  "commit-operator-cancellation",
  async (input: Omit<OperatorCancellationRequest, "now">, { container }) =>
    cancellationStepResponse(await cancelByOperator(container, input)),
)

/** What the operator sees after cancelling, or after repeating the request. */
export type OperatorCancellationView = {
  order_id: string
  /** False when the Order was already cancelled and nothing changed now. */
  cancelled_now: boolean
  cancellation:
    | (NonNullable<CancellationOutcome> & {
        cancelled_by: string | null
        /** The operator's reason; only Operator cancellations carry one here. */
        reason: string | null
      })
    | null
  delivery: {
    outcome: TerminalOutcome | null
    ended_at: string | null
  } | null
  refund: RefundOutcomeView
  food_credit: FoodCreditView
}

/**
 * The Order's cancellation, delivery end, refund and food credit as the
 * operator sees them after the request. `cancelled_now` says whether this
 * request committed the cancellation or found it already recorded.
 */
export async function readOperatorCancellation(
  container: MedusaContainer,
  order_id: string,
  cancelled_now: boolean,
): Promise<OperatorCancellationView> {
  const [record] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id },
      {
        select: [
          "cancelled_at",
          "cancelled_by",
          "cancellation_category",
          "cancellation_note",
          "acceptance_deadline",
          "accepted_at",
        ],
        take: 1,
      },
    )
  if (!record) throw notFound()
  const [delivery] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      { order_id },
      { select: ["terminal_outcome", "terminal_at"], take: 1 },
    )
  const [refunds, credits] = await Promise.all([
    refundOutcomesOf(container, [order_id]),
    foodCreditsOf(container, [order_id]),
  ])
  const category = record.cancellation_category as CancellationCategory | null
  const cancellation = cancellationOutcome({
    ...record,
    cancellation_category: category,
  })
  return {
    order_id,
    cancelled_now,
    cancellation: cancellation && {
      ...cancellation,
      cancelled_by: record.cancelled_by,
      reason:
        category === "operator_cancelled" ? record.cancellation_note : null,
    },
    delivery: delivery
      ? {
          outcome: (delivery.terminal_outcome as TerminalOutcome) ?? null,
          ended_at: iso(delivery.terminal_at),
        }
      : null,
    refund: refunds.get(order_id) ?? null,
    food_credit: credits.get(order_id) ?? null,
  }
}

export const readOperatorCancellationStep = createStep(
  "read-operator-cancellation",
  async (input: { order_id: string; cancelled_now: boolean }, { container }) =>
    new StepResponse(
      await readOperatorCancellation(
        container,
        input.order_id,
        input.cancelled_now,
      ),
    ),
)

/**
 * What the confirmation shows before an Operator cancellation (#199): the
 * Full refund the Order would owe now, from the same exact calculation the
 * cancellation records, or null when nothing captured is left to refund.
 */
export const previewOperatorCancellationStep = createStep(
  "preview-operator-cancellation",
  async (input: { order_id: string }, { container }) => {
    const [record] = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .listOrderOperations(
        { order_id: input.order_id },
        { select: ["id"], take: 1 },
      )
    if (!record) throw notFound()
    const owed = await owedRefund(container, input.order_id)
    return new StepResponse({
      order_id: input.order_id,
      refund: owed && {
        amount_including_vat: Number(owed.amount),
        currency_code: owed.currency_code,
      },
    })
  },
)
