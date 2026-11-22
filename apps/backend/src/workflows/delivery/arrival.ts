import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import {
  ARRIVAL_CONFLICTS,
  CONTACT_ATTEMPT_CONFLICTS,
  arrivalAttentionDueAt,
  decideArrival,
  decideContactAttempt,
  type ArrivalRefusal,
  type ContactAttemptRefusal,
} from "./arrival-rules"
import { readCurrentDeliveryStep } from "./assignment"
import { deliveryRefusal, underDeliveryGuard } from "./delivery-guard"

type MilestoneInput = {
  order_id: string
  agent_id: string
  request_id: string
}

/**
 * The guarded arrival (#164). A committed arrival is an authoritative
 * milestone and has no compensation (ADR-0021): undoing it would let a retry
 * move the unreachable-Customer clock. Its obligation is stored in the same
 * commit, so no follow-up work is owed beyond raising that attention, which
 * the `recover-delivery-attention` job does from the durable record.
 */
export const recordArrivalStep = createStep(
  "record-arrival",
  async (input: MilestoneInput, { container }) => {
    const result = await underDeliveryGuard(
      container,
      input,
      ({ order_active, now }) =>
        container.resolve<DeliveryModuleService>(DELIVERY_MODULE).recordArrival(
          {
            ...input,
            order_active,
            now,
            arrival_attention_due_at: arrivalAttentionDueAt(now),
          },
          decideArrival,
        ),
    )
    if (result.outcome.outcome === "refused")
      throw deliveryRefusal(
        result.outcome.code as ArrivalRefusal,
        ARRIVAL_CONFLICTS,
      )
    return new StepResponse({ order_id: input.order_id })
  },
)

/**
 * The guarded contact attempt (#164). A recorded attempt is an authoritative
 * milestone and has no compensation (ADR-0021): it is the operator's evidence
 * that the agent tried to reach the Customer, and a retry with the same
 * identity returns it rather than recording a new time. It owes no follow-up
 * work, so no recovery job is involved.
 */
export const recordContactAttemptStep = createStep(
  "record-contact-attempt",
  async (input: MilestoneInput, { container }) => {
    const result = await underDeliveryGuard(
      container,
      input,
      ({ order_active, now }) =>
        container
          .resolve<DeliveryModuleService>(DELIVERY_MODULE)
          .recordContactAttempt(
            { ...input, order_active, now },
            decideContactAttempt,
          ),
    )
    if (result.outcome.outcome === "refused")
      throw deliveryRefusal(
        result.outcome.code as ContactAttemptRefusal,
        CONTACT_ATTEMPT_CONFLICTS,
      )
    return new StepResponse({ order_id: input.order_id })
  },
)

/**
 * The responsible agent records reaching the destination (#164; spec #48
 * story 36): once, with the server's time, starting the unreachable-Customer
 * clock. Returns the current delivery view.
 */
export const confirmArrivalWorkflow = createWorkflow(
  "confirm-arrival",
  function (input: MilestoneInput) {
    const recorded = recordArrivalStep(input)
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
 * The responsible agent records one attempt to reach the Customer after
 * arrival (#164; spec #48 story 37). Returns the current delivery view.
 */
export const addContactAttemptWorkflow = createWorkflow(
  "add-contact-attempt",
  function (input: MilestoneInput) {
    const recorded = recordContactAttemptStep(input)
    return new WorkflowResponse(
      readCurrentDeliveryStep(
        transform({ input, recorded }, ({ input }) => ({
          agent_id: input.agent_id,
        })),
      ),
    )
  },
)
