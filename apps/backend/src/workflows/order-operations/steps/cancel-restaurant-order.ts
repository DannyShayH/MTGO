import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../../modules/order-operation"
import type OrderOperationModuleService from "../../../modules/order-operation/service"
import type { OrderOperationState } from "../../../modules/order-operation/models/order-operation"
import { withResponseFields } from "../../common/response-fields"
import { decideCancellation, ORDER_CHANGED, SYSTEM_ACTOR } from "../rules"
import { owedFullRefund, type PaymentFacts } from "../refund-rules"
import { orderNotFound, readRestaurantOrder } from "./read-restaurant-orders"

type Input = {
  restaurant_id: string
  order_id: string
  staff_id: string
  note: string | null
}

/** Whether this request committed the cancellation, and whom it records. */
type CancellationResult = { cancelled: boolean; cancelled_by: string | null }

type GuardedRecord = {
  id: string
  state: OrderOperationState
  acceptance_deadline: Date | null
  accepted_at: Date | null
  revision: number
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

async function refuseWithCurrent(
  container: MedusaContainer,
  input: Input,
  code: string,
) {
  const current = await readRestaurantOrder(container, input)
  const type =
    code === ORDER_CHANGED
      ? MedusaError.Types.CONFLICT
      : MedusaError.Types.NOT_ALLOWED
  return withResponseFields(new MedusaError(type, code, code), current)
}

/**
 * Staff rejection's guarded transition (#143), run under the Order's lock.
 * It re-reads the record and decides at the server's time: before the
 * deadline the Order is rejected, at or after it the Order receives the
 * timeout outcome instead. Cancellation, actor, category, note and the full
 * refund obligation commit in one transaction before any provider is
 * contacted. A recorded cancellation is the current outcome for a repeat.
 *
 * There is deliberately no compensation: once committed, the cancellation is
 * authoritative and nothing that follows may reactivate the Order.
 */
export const cancelRestaurantOrderStep = createStep(
  "cancel-restaurant-order",
  async (input: Input, { container }) => {
    const service = container.resolve<OrderOperationModuleService>(
      ORDER_OPERATION_MODULE,
    )
    const [record] = (await service.listOrderOperations(
      { order_id: input.order_id, restaurant_id: input.restaurant_id },
      {
        select: [
          "id",
          "state",
          "acceptance_deadline",
          "accepted_at",
          "revision",
        ],
        take: 1,
      },
    )) as unknown as GuardedRecord[]
    if (!record) throw orderNotFound()
    const now = new Date()
    const decision = decideCancellation(record, "restaurant_rejected", now)
    if (decision.outcome === "refused")
      throw await refuseWithCurrent(container, input, decision.code)
    if (decision.outcome === "already_cancelled")
      return new StepResponse<CancellationResult>({
        cancelled: false,
        cancelled_by: null,
      })
    // A timeout is the system's outcome, with no staff note.
    const rejection =
      decision.category === "acceptance_timeout"
        ? { cancelled_by: SYSTEM_ACTOR, note: null }
        : { cancelled_by: input.staff_id, note: input.note }
    const committed = await service.cancelWithRefundObligation({
      id: record.id,
      order_id: input.order_id,
      revision: record.revision,
      cancelled_at: now,
      cancelled_by: rejection.cancelled_by,
      category: decision.category,
      note: rejection.note,
      refund: await owedRefund(container, input.order_id),
    })
    if (!committed)
      throw await refuseWithCurrent(container, input, ORDER_CHANGED)
    return new StepResponse<CancellationResult>({
      cancelled: true,
      cancelled_by: rejection.cancelled_by,
    })
  },
)
