import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  OrderWorkflowEvents,
  PaymentCollectionStatus,
  ReservationItemWorkflowEvents,
} from "@medusajs/framework/utils"
import {
  cancelOrdersStep,
  cancelPaymentStep,
  deleteReservationsByLineItemsStep,
  emitEventStep,
  updatePaymentCollectionStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import { nativeCancellationPlan, type NativeOrderFacts } from "./refund-rules"
import type OrderOperationModuleService from "../../modules/order-operation/service"

const recordNativeCancellationStep = createStep(
  "record-native-order-cancellation",
  async (input: { order_id: string }, { container }) => {
    const service = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    const [record] = await service.listOrderOperations(
      { order_id: input.order_id, native_cancelled_at: null },
      { select: ["id"], take: 1 },
    )
    if (record)
      await service.updateOrderOperations({
        id: record.id,
        native_cancelled_at: new Date(),
      })
    return new StepResponse(undefined)
  },
)

/**
 * Brings the native Medusa Order in line with a committed business
 * cancellation (#143), with the same core steps and events as Medusa's
 * `cancelOrderWorkflow`, except its refund: that workflow refunds captured
 * payments without a stored idempotency key before it cancels, so the full
 * refund runs separately (`attemptFullRefund`) and is never repeated here.
 *
 * Reservations are released, uncaptured payments cancelled, the payment
 * collection marked cancelled and `order.canceled` emitted. An Order Medusa
 * already cancelled is only recorded, so a repeat emits nothing twice.
 */
export const syncNativeOrderCancellationWorkflow = createWorkflow(
  "sync-native-order-cancellation",
  function (input: { order_id: string }) {
    const { data } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "status",
        "items.id",
        "payment_collections.id",
        "payment_collections.payments.id",
        "payment_collections.payments.captures.id",
      ],
      filters: { id: input.order_id },
      options: { throwIfKeyNotFound: true },
    }).config({ name: "get-native-order" })
    const order = transform(
      { data },
      ({ data }) => data[0] as unknown as NativeOrderFacts,
    )
    const plan = transform({ order }, ({ order }) =>
      nativeCancellationPlan(order),
    )
    when(
      "native-order-not-cancelled",
      { plan },
      ({ plan }) => plan.pending,
    ).then(() => {
      const deletedReservationIds = deleteReservationsByLineItemsStep(
        transform({ plan }, ({ plan }) => plan.line_item_ids),
      )
      cancelPaymentStep(
        transform({ plan }, ({ plan }) => ({
          paymentIds: plan.uncaptured_payment_ids,
        })),
      )
      emitEventStep({
        eventName: OrderWorkflowEvents.CANCELED,
        data: { id: input.order_id },
      })
      emitEventStep(
        transform(
          { deletedReservationIds, input },
          ({ deletedReservationIds, input }) => ({
            eventName: ReservationItemWorkflowEvents.DELETED,
            data: ((deletedReservationIds ?? []) as string[]).map((id) => ({
              id,
              order_id: input.order_id,
            })),
          }),
        ),
      ).config({ name: "emit-reservation-item-deleted" })
    })
    when(
      "native-payment-collections-not-cancelled",
      { plan },
      ({ plan }) => plan.pending && plan.payment_collection_ids.length > 0,
    ).then(() => {
      updatePaymentCollectionStep(
        transform({ plan }, ({ plan }) => ({
          selector: { id: plan.payment_collection_ids },
          update: { status: PaymentCollectionStatus.CANCELED },
        })),
      )
    })
    when(
      "native-order-still-active",
      { plan },
      ({ plan }) => plan.pending,
    ).then(() => {
      cancelOrdersStep(
        transform({ input }, ({ input }) => ({ orderIds: [input.order_id] })),
      )
    })
    recordNativeCancellationStep({ order_id: input.order_id })
    return new WorkflowResponse(undefined)
  },
)
