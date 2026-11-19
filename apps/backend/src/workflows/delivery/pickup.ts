import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
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
} from "@medusajs/medusa/core-flows"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { orderOperationLock } from "../order-operations/locks"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import {
  deliveryAgentAccessRevoked,
  readCurrentDeliveryStep,
} from "./assignment"
import { deliveryAgentLockKey, nativePickupLock } from "./locks"
import {
  PICKUP_CONFLICTS,
  decidePickup,
  type PickupRefusal,
} from "./pickup-rules"

/** How many pickups one recovery sweep synchronizes; the rest wait a tick. */
export const PICKUP_RECOVERY_BATCH_SIZE = 50

function refusal(code: PickupRefusal) {
  // An agent whose access ended is signed out, as on every agent route.
  if (code === "delivery_agent_not_authorized")
    return deliveryAgentAccessRevoked()
  const type = (PICKUP_CONFLICTS as readonly string[]).includes(code)
    ? MedusaError.Types.CONFLICT
    : MedusaError.Types.NOT_ALLOWED
  return new MedusaError(type, code, code)
}

type PickupInput = {
  order_id: string
  agent_id: string
  request_id: string
}

/**
 * The guarded pickup (#160). It holds the agent's capacity key and the
 * Order's authoritative guard, in the same order as assignment, so pickup
 * serializes with claims and with the Restaurant's milestones and a future
 * terminal outcome. Under them it reads the Order's state and readiness
 * (#146) and lets the delivery module record the milestone. A committed
 * pickup is authoritative and has no compensation.
 */
export const recordPickupStep = createStep(
  "record-pickup",
  async (input: PickupInput, { container }) => {
    const keys = [
      deliveryAgentLockKey(input.agent_id),
      orderOperationLock(input.order_id).key,
    ]
    const result = await container.resolve(Modules.LOCKING).execute(
      keys,
      async () => {
        const [operation] = await container
          .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
          .listOrderOperations(
            { order_id: input.order_id },
            { select: ["state", "ready_at"], take: 1 },
          )
        return container
          .resolve<DeliveryModuleService>(DELIVERY_MODULE)
          .recordPickup(
            {
              ...input,
              order: operation ?? { state: "cancelled", ready_at: null },
              // Decided at the guarded moment, not when the request arrived.
              now: new Date(),
            },
            decidePickup,
          )
      },
      { timeout: 10 },
    )
    if (result.outcome.outcome === "refused")
      throw refusal(result.outcome.code as PickupRefusal)
    return new StepResponse({ order_id: input.order_id })
  },
)

type NativeOrder = {
  id: string
  items: { id: string; quantity: number }[]
  fulfillments?: {
    id: string
    metadata: Record<string, unknown> | null
    shipped_at: string | null
    canceled_at: string | null
  }[]
  shipping_methods?: { shipping_option_id: string | null }[]
}

/**
 * The stock location the Order's purchased delivery option is configured
 * at: its service zone's fulfillment set location. Never a fixed id.
 */
async function pickupLocationOf(
  container: MedusaContainer,
  order: NativeOrder,
): Promise<string> {
  const optionIds = (order.shipping_methods ?? [])
    .map(({ shipping_option_id }) => shipping_option_id)
    .filter((id): id is string => !!id)
  const { data } = optionIds.length
    ? await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "shipping_option",
        fields: ["id", "service_zone.fulfillment_set.location.id"],
        filters: { id: optionIds },
      })
    : { data: [] }
  const location = (
    data as {
      service_zone?: { fulfillment_set?: { location?: { id: string } } }
    }[]
  ).find((option) => option.service_zone?.fulfillment_set?.location?.id)
    ?.service_zone?.fulfillment_set?.location?.id
  if (!location)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "pickup_location_missing",
    )
  return location
}

/**
 * Brings the native Order in line with a recorded pickup through Medusa's
 * own Order fulfillment and shipment workflows: one fulfillment of every
 * item at the configured pickup location, marked shipped because the food
 * has left the Restaurant. It is not marked delivered; handover does that.
 *
 * The fulfillment carries the delivery's id, so a retry after a lost write
 * finds it instead of creating a second one, and an unshipped one is
 * shipped. Each step is serialized per Order between the request and the
 * recovery sweep. A failure is logged and stays owed in the delivery record.
 */
export async function settleNativePickup(
  container: MedusaContainer,
  order_id: string,
): Promise<"synced" | "pending"> {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const settle = async () => {
    const [record] = await delivery.listIntendedDeliveries(
      { order_id },
      { take: 1 },
    )
    if (!record?.picked_up_at || record.native_fulfillment_id) return
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
          "fulfillments.canceled_at",
          "shipping_methods.shipping_option_id",
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
          location_id: await pickupLocationOf(container, order),
          created_by,
          no_notification: true,
          metadata: { intended_delivery_id: record.id },
        },
      })
      fulfillment = {
        id: result.id,
        metadata: null,
        shipped_at: null,
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
  }
  const lock = nativePickupLock(order_id)
  try {
    await container
      .resolve(Modules.LOCKING)
      .execute(lock.key, settle, { timeout: lock.timeout, expire: lock.ttl })
    return "synced"
  } catch (error) {
    logRecoveryFailure(container, order_id, error)
    return "pending"
  }
}

/**
 * Attempts the native synchronization right after the pickup committed. Its
 * failure never fails the agent's request: the milestone stands, and the
 * recovery sweep finishes the owed work.
 */
const settleNativePickupStep = createStep(
  "settle-native-pickup",
  async (input: { order_id: string }, { container }) => {
    await settleNativePickup(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * The responsible agent confirms collecting ready food (#160): records the
 * milestone once, synchronizes native fulfillment and returns the current
 * delivery view with the pickup and the next permitted action.
 */
export const confirmPickupWorkflow = createWorkflow(
  "confirm-pickup",
  function (input: PickupInput) {
    const recorded = recordPickupStep(input)
    settleNativePickupStep(recorded)
    return new WorkflowResponse(
      readCurrentDeliveryStep(
        // `recorded` only orders the read after the write.
        transform({ input, recorded }, ({ input }) => ({
          agent_id: input.agent_id,
        })),
      ),
    )
  },
)

/**
 * One bounded sweep of pickups whose native synchronization is still owed,
 * found from durable records only, so the first tick after a restart is
 * the startup reconciliation.
 */
const recoverDeliveryPickupsStep = createStep(
  "recover-delivery-pickups",
  async (_input: Record<string, never>, { container }) => {
    const owed = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        { picked_up_at: { $ne: null }, native_fulfillment_id: null },
        {
          take: PICKUP_RECOVERY_BATCH_SIZE,
          select: ["order_id"],
          order: { native_sync_queued_at: "ASC" },
        },
      )
    const synced: string[] = []
    for (const { order_id } of owed)
      if ((await settleNativePickup(container, order_id)) === "synced")
        synced.push(order_id)
    return new StepResponse({ synced })
  },
)

export const recoverDeliveryPickupsWorkflow = createWorkflow(
  "recover-delivery-pickups",
  function (input: Record<string, never>) {
    return new WorkflowResponse(recoverDeliveryPickupsStep(input))
  },
)
