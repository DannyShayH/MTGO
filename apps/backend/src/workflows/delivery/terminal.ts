import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { logMilestone, milestoneActor } from "../../observability/milestone-log"
import { orderOperationLock } from "../order-operations/locks"
import { deliveryAgentAccessRevoked } from "./agent-access"
import { isActiveOrderState } from "./assignment-rules"
import { readCompletedDeliveryStep } from "./history"
import { deliveryAgentLockKey } from "./locks"
import { settleNativeFulfillment } from "./native-fulfillment"
import { recordDeliveryEndOnOrderStep } from "./order-outcome"
import { recognizeDeliveredOrderStep } from "../restaurant-finance/recognition"
import {
  HANDOVER_CONFLICTS,
  decideTermination,
  handoverTransition,
  type HandoverRefusal,
} from "./terminal-rules"

function refusal(code: HandoverRefusal) {
  // An agent whose access ended is signed out, as on every agent route.
  if (code === "delivery_agent_not_authorized")
    return deliveryAgentAccessRevoked()
  const type = (HANDOVER_CONFLICTS as readonly string[]).includes(code)
    ? MedusaError.Types.CONFLICT
    : MedusaError.Types.NOT_ALLOWED
  return new MedusaError(type, code, code)
}

async function orderIsActive(container: MedusaContainer, order_id: string) {
  const [operation] = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations({ order_id }, { select: ["state"], take: 1 })
  return !!operation && isActiveOrderState(operation.state)
}

type HandoverInput = {
  order_id: string
  agent_id: string
  request_id: string
}

/**
 * The guarded handover (#161). It holds the agent's capacity key and the
 * Order's authoritative guard, in the same order as assignment and pickup,
 * so handover serializes with claims, kitchen milestones and an Order's
 * termination. Under them it reads whether the Order is still active and
 * lets the delivery module end the delivery and release capacity in one
 * write. A committed handover is authoritative and has no compensation.
 */
export const recordHandoverStep = createStep(
  "record-handover",
  async (input: HandoverInput, { container }) => {
    const keys = [
      deliveryAgentLockKey(input.agent_id),
      orderOperationLock(input.order_id).key,
    ]
    const result = await container.resolve(Modules.LOCKING).execute(
      keys,
      async () =>
        container.resolve<DeliveryModuleService>(DELIVERY_MODULE).endDelivery(
          {
            order_id: input.order_id,
            outcome: "delivered",
            actor_id: input.agent_id,
            agent_id: input.agent_id,
            request_id: input.request_id,
            order_active: await orderIsActive(container, input.order_id),
            // Decided at the guarded moment, not when the request arrived.
            now: new Date(),
          },
          handoverTransition,
        ),
      { timeout: 10 },
    )
    if (result.decision.outcome === "refused")
      throw refusal(result.decision.code as HandoverRefusal)
    if (result.decision.outcome === "end")
      logMilestone(container, "delivery.handed_over", {
        order_id: input.order_id,
        restaurant_id: result.delivery.restaurant_id,
        ...milestoneActor(input.agent_id),
      })
    return new StepResponse({ order_id: input.order_id })
  },
)

/**
 * Marks the native fulfillment delivered right after the handover committed.
 * Its failure never fails the agent's request: the outcome stands, and the
 * recovery sweep finishes the owed work.
 */
const settleNativeHandoverStep = createStep(
  "settle-native-handover",
  async (input: { order_id: string }, { container }) => {
    await settleNativeFulfillment(container, input.order_id)
    return new StepResponse(undefined)
  },
)

/**
 * The responsible agent confirms actual handover (#161; spec #48 stories 39,
 * 40, 60): ends the delivery once as delivered, frees the agent for new work,
 * synchronizes the native Order and returns the completed entry as the
 * agent's history shows it, without the Customer's contact details. The
 * Order's kitchen record then records the handover (#204), so the Order
 * leaves the Restaurant's In progress for History, and Restaurant finance
 * recognizes its food credit and commission (#227).
 */
export const confirmHandoverWorkflow = createWorkflow(
  "confirm-handover",
  function (input: HandoverInput) {
    const recorded = recordHandoverStep(input)
    settleNativeHandoverStep(recorded)
    recordDeliveryEndOnOrderStep(recorded)
    // After every guard is released: finance takes its own (#227).
    recognizeDeliveredOrderStep(recorded)
    return new WorkflowResponse(
      readCompletedDeliveryStep(
        // `recorded` only orders the read after the write.
        transform({ input, recorded }, ({ input }) => ({
          agent_id: input.agent_id,
          order_id: input.order_id,
        })),
      ),
    )
  },
)

export type TerminationInput = {
  order_id: string
  outcome: "cancelled" | "failed"
  /** Who decided: an operator, the Customer or `system`. */
  actor_id: string
  /** The time the authoritative outcome was committed. */
  now: Date
}

/**
 * The shared terminal boundary for an Order's authoritative cancellation
 * (#162) and an operator-confirmed failure (#49). The caller must already
 * hold the Order's guard (`orderOperationLock`), as cancellation does, and
 * call this in the same guarded section. It ends unended work with that
 * outcome and releases the agent's capacity; work that already ended keeps
 * its outcome, so a delivered Order is never rewritten. Responsibility and
 * every earlier milestone are kept. An Order without accepted work has no
 * delivery and is left alone.
 */
export async function endDeliveryForOrder(
  container: MedusaContainer,
  input: TerminationInput,
) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const [record] = await delivery.listIntendedDeliveries(
    { order_id: input.order_id },
    { take: 1, select: ["id"] },
  )
  if (!record) return { outcome: "no_delivery" as const }
  const { decision } = await delivery.endDelivery(
    {
      order_id: input.order_id,
      outcome: input.outcome,
      actor_id: input.actor_id,
      order_active: false,
      now: input.now,
    },
    (facts) => decideTermination(facts.delivery),
  )
  return decision
}

/**
 * The terminal boundary for a caller that does not already hold the Order's
 * guard, such as #49's operator-confirmed failure: it takes the guard and
 * applies `endDeliveryForOrder` under it. The terminal outcome is
 * authoritative and has no compensation (ADR-0021).
 */
const endDeliveryStep = createStep(
  "end-delivery",
  async (input: Omit<TerminationInput, "now">, { container }) => {
    const decision = await container
      .resolve(Modules.LOCKING)
      .execute(
        orderOperationLock(input.order_id).key,
        () => endDeliveryForOrder(container, { ...input, now: new Date() }),
        { timeout: 10 },
      )
    return new StepResponse(decision)
  },
)

/**
 * Ends the delivery for a caller without the Order's guard, then records
 * the end on the Order's kitchen record (#204), as owed work that never
 * fails the request.
 */
export const endDeliveryWorkflow = createWorkflow(
  "end-delivery",
  function (input: Omit<TerminationInput, "now">) {
    const decision = endDeliveryStep(input)
    recordDeliveryEndOnOrderStep(
      // `decision` only orders the record after the terminal write.
      transform({ input, decision }, ({ input }) => ({
        order_id: input.order_id,
      })),
    )
    return new WorkflowResponse(decision)
  },
)
