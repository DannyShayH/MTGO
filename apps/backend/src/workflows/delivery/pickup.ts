import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { logMilestone, milestoneActor } from "../../observability/milestone-log"
import { orderOperationLock } from "../order-operations/locks"
import { deliveryAgentAccessRevoked } from "./agent-access"
import { readCurrentDeliveryStep } from "./assignment"
import { stalledAttentionDueAt } from "./attention-rules"
import { deliveryAgentLockKey } from "./locks"
import { settleNativeFulfillment } from "./native-fulfillment"
import { recordPickupOnOrderStep } from "./order-pickup"
import {
  PICKUP_CONFLICTS,
  decidePickup,
  type PickupRefusal,
} from "./pickup-rules"

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
        // Decided at the guarded moment, not when the request arrived.
        const now = new Date()
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
              now,
              transit_attention_due_at: stalledAttentionDueAt(now),
            },
            decidePickup,
          )
      },
      { timeout: 10 },
    )
    if (result.outcome.outcome === "refused")
      throw refusal(result.outcome.code as PickupRefusal)
    if (result.outcome.outcome === "pick_up")
      logMilestone(container, "delivery.picked_up", {
        order_id: input.order_id,
        restaurant_id: result.delivery.restaurant_id,
        ...milestoneActor(input.agent_id),
      })
    return new StepResponse({ order_id: input.order_id })
  },
)

/**
 * Attempts the native synchronization right after the pickup committed. Its
 * failure never fails the agent's request: the milestone stands, and the
 * recovery sweep finishes the owed work.
 */
const settleNativePickupStep = createStep(
  "settle-native-pickup",
  async (input: { order_id: string }, { container }) => {
    await settleNativeFulfillment(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * The responsible agent confirms collecting ready food (#160): records the
 * milestone once, synchronizes native fulfillment and returns the current
 * delivery view with the pickup and the next permitted action. The Order's
 * kitchen record then records the pickup time (#254), so the Restaurant sees
 * the food has left.
 */
export const confirmPickupWorkflow = createWorkflow(
  "confirm-pickup",
  function (input: PickupInput) {
    const recorded = recordPickupStep(input)
    settleNativePickupStep(recorded)
    recordPickupOnOrderStep(recorded)
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
