import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { createLogRecord } from "@dtc/logging"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import { nativeFulfillmentLock } from "./locks"

/** How many deliveries one recovery sweep synchronizes; the rest wait a tick. */
export const FULFILLMENT_RECOVERY_BATCH_SIZE = 50

type NativeOrder = {
  id: string
  items: { id: string; quantity: number }[]
  fulfillments?: {
    id: string
    metadata: Record<string, unknown> | null
    shipped_at: string | null
    delivered_at: string | null
    canceled_at: string | null
  }[]
  restaurant?: { stock_location?: { id: string } | null } | null
}

/**
 * The stock location linked to the Restaurant that prepared this Order.
 */
const PICKUP_LOCATION_MISSING = "pickup_location_missing"

class PickupLocationMissingError extends MedusaError {
  constructor() {
    super(MedusaError.Types.UNEXPECTED_STATE, PICKUP_LOCATION_MISSING)
  }
}

function resolvePickupLocationId(order: NativeOrder): string {
  const location = order.restaurant?.stock_location?.id
  if (!location) throw new PickupLocationMissingError()
  return location
}

/**
 * Brings the native Order in line with the recorded delivery milestones
 * through Medusa's own Order workflows. After pickup (#160): one fulfillment
 * of every item at the configured pickup location, marked shipped because
 * the food has left the Restaurant. After handover (#161): that fulfillment
 * marked delivered. Cancelled and failed work is never marked delivered.
 *
 * The fulfillment carries the delivery's id, so a retry after a lost write
 * finds it instead of creating a second one; a step already done natively
 * is not repeated. Each run is serialized per Order between the request and
 * the recovery sweep. A failure is logged and stays owed in the delivery
 * record.
 */
export async function settleNativeFulfillment(
  container: MedusaContainer,
  order_id: string,
): Promise<"synced" | "pending"> {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const settle = async () => {
    const [record] = await delivery.listIntendedDeliveries(
      { order_id },
      { take: 1 },
    )
    if (!record?.picked_up_at) return
    const owesDelivered =
      record.terminal_outcome === "delivered" && !record.native_delivered_at
    if (record.native_fulfillment_id && !owesDelivered) return
    // Requeued before trying, so a failure goes to the back of the sweep.
    await delivery.updateIntendedDeliveries({
      id: record.id,
      native_sync_queued_at: new Date(),
    })
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "order",
        fields: [
          "id",
          "items.id",
          "items.quantity",
          "fulfillments.id",
          "fulfillments.metadata",
          "fulfillments.shipped_at",
          "fulfillments.delivered_at",
          "fulfillments.canceled_at",
          "restaurant.stock_location.id",
        ],
        filters: { id: order_id },
      })
    const order = data[0] as unknown as NativeOrder
    const items = order.items.map(({ id, quantity }) => ({ id, quantity }))
    const created_by = record.picked_up_by as string
    let fulfillment = order.fulfillments?.find(
      ({ metadata, canceled_at }) =>
        !canceled_at && metadata?.intended_delivery_id === record.id,
    )
    if (!fulfillment) {
      const { result } = await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id,
          items,
          location_id: resolvePickupLocationId(order),
          created_by,
          no_notification: true,
          metadata: { intended_delivery_id: record.id },
        },
      })
      fulfillment = {
        id: result.id,
        metadata: null,
        shipped_at: null,
        delivered_at: null,
        canceled_at: null,
      }
    }
    if (!fulfillment.shipped_at)
      await createOrderShipmentWorkflow(container).run({
        input: {
          order_id,
          fulfillment_id: fulfillment.id,
          items,
          created_by,
          no_notification: true,
        },
      })
    await delivery.recordNativePickup({
      order_id,
      fulfillment_id: fulfillment.id,
    })
    if (!owesDelivered) return
    if (!fulfillment.delivered_at)
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({
        input: { orderId: order_id, fulfillmentId: fulfillment.id },
      })
    await delivery.recordNativeDelivered({ order_id, now: new Date() })
  }
  const lock = nativeFulfillmentLock(order_id)
  try {
    await container
      .resolve(Modules.LOCKING)
      .execute(lock.key, settle, { timeout: lock.timeout, expire: lock.ttl })
    return "synced"
  } catch (error) {
    if (error instanceof PickupLocationMissingError) {
      const record = createLogRecord("backend", PICKUP_LOCATION_MISSING, {
        order_id,
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .log(record.level, record.msg, record)
    } else logRecoveryFailure(container, order_id, error)
    return "pending"
  }
}

/**
 * One bounded sweep of deliveries whose native synchronization is still
 * owed after pickup or handover, found from durable records only, so the
 * first tick after a restart is the startup reconciliation.
 */
const recoverDeliveryFulfillmentsStep = createStep(
  "recover-delivery-fulfillments",
  async (_input: Record<string, never>, { container }) => {
    const owed = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        {
          $or: [
            { picked_up_at: { $ne: null }, native_fulfillment_id: null },
            { terminal_outcome: "delivered", native_delivered_at: null },
          ],
        },
        {
          take: FULFILLMENT_RECOVERY_BATCH_SIZE,
          select: ["order_id"],
          order: { native_sync_queued_at: "ASC" },
        },
      )
    const synced: string[] = []
    for (const { order_id } of owed)
      if ((await settleNativeFulfillment(container, order_id)) === "synced")
        synced.push(order_id)
    return new StepResponse({ synced })
  },
)

export const recoverDeliveryFulfillmentsWorkflow = createWorkflow(
  "recover-delivery-fulfillments",
  function (input: Record<string, never>) {
    return new WorkflowResponse(recoverDeliveryFulfillmentsStep(input))
  },
)
