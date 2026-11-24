import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { FEEDBACK_MODULE } from "../../modules/feedback"
import type FeedbackModuleService from "../../modules/feedback/service"
import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"
import { withResponseFields } from "../common/response-fields"
import {
  decideFeedback,
  FEEDBACK_ALREADY_SUBMITTED,
  feedbackView,
  type CustomerFeedbackView,
  type FeedbackRatings,
  type FeedbackRefusal,
  type RecordedFeedback,
} from "./rules"

export * from "./rules"

const feedbackService = (container: MedusaContainer) =>
  container.resolve<FeedbackModuleService>(FEEDBACK_MODULE)

async function readDelivery(container: MedusaContainer, orderId: string) {
  const [delivery] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listIntendedDeliveries(
      { order_id: orderId },
      {
        select: [
          "terminal_outcome",
          "terminal_at",
          "restaurant_id",
          "assigned_agent_id",
        ],
        take: 1,
      },
    )
  if (!delivery) return null
  return {
    ...delivery,
    terminal_outcome: delivery.terminal_outcome as TerminalOutcome | null,
    terminal_at: delivery.terminal_at ? new Date(delivery.terminal_at) : null,
  }
}

async function readFeedback(
  container: MedusaContainer,
  orderId: string,
): Promise<RecordedFeedback | null> {
  const [feedback] = await feedbackService(container).listFeedbacks(
    { order_id: orderId },
    {
      select: [
        "food_rating",
        "experience_rating",
        "agent_rating",
        "created_at",
      ],
      take: 1,
    },
  )
  return feedback ?? null
}

const refusal = (code: FeedbackRefusal) =>
  new MedusaError(MedusaError.Types.NOT_ALLOWED, code, code)

/** The recorded Feedback, as a `409` carries it so the page can show it. */
function alreadySubmitted(feedback: RecordedFeedback) {
  return withResponseFields(
    new MedusaError(
      MedusaError.Types.CONFLICT,
      FEEDBACK_ALREADY_SUBMITTED,
      FEEDBACK_ALREADY_SUBMITTED,
    ),
    { feedback: feedbackView({ status: "submitted", feedback }).feedback },
  )
}

export const retrieveOrderFeedbackStateStep = createStep(
  "retrieve-order-feedback-state",
  async (input: { order_id: string }, { container }) => {
    const [delivery, feedback] = await Promise.all([
      readDelivery(container, input.order_id),
      readFeedback(container, input.order_id),
    ])
    return new StepResponse(
      feedbackView(decideFeedback({ delivery, feedback, now: new Date() })),
    )
  },
)

/**
 * The owning Customer's Feedback state for an Order (#218): the recorded
 * ratings, or whether they may submit. Ownership is checked by the route's
 * middleware, as for Order progress.
 */
export const retrieveOrderFeedbackWorkflow = createWorkflow(
  "retrieve-order-feedback",
  function (input: { order_id: string }) {
    return new WorkflowResponse(retrieveOrderFeedbackStateStep(input))
  },
)

export type SubmitFeedbackInput = {
  order_id: string
  customer_id: string
  ratings: FeedbackRatings
}

/**
 * Records the Customer's one Feedback with the Delivery's Restaurant,
 * responsible agent and handover time copied in. The unique `order_id`
 * decides concurrent submissions: the losing insert reads the winner and
 * answers `feedback_already_submitted` with it. The only compensation
 * removes the Feedback this run created, should a later step fail.
 */
export const recordFeedbackStep = createStep(
  "record-feedback",
  async (input: SubmitFeedbackInput, { container }) => {
    const [delivery, existing] = await Promise.all([
      readDelivery(container, input.order_id),
      readFeedback(container, input.order_id),
    ])
    const decision = decideFeedback({
      delivery,
      feedback: existing,
      now: new Date(),
    })
    if (decision.status === "submitted")
      throw alreadySubmitted(decision.feedback)
    if (decision.status === "unavailable") throw refusal(decision.reason)
    let created: RecordedFeedback & { id: string }
    try {
      created = await feedbackService(container).createFeedbacks({
        order_id: input.order_id,
        customer_id: input.customer_id,
        ...decision.subjects,
        ...input.ratings,
      })
    } catch (error) {
      // A concurrent submission committed first.
      const winner = await readFeedback(container, input.order_id)
      if (winner) throw alreadySubmitted(winner)
      throw error
    }
    return new StepResponse(
      feedbackView({ status: "submitted", feedback: created }),
      created.id,
    )
  },
  async (createdId: string | undefined, { container }) => {
    if (createdId) await feedbackService(container).deleteFeedbacks(createdId)
  },
)

export const submitFeedbackWorkflow = createWorkflow(
  "submit-feedback",
  function (input: SubmitFeedbackInput) {
    return new WorkflowResponse<CustomerFeedbackView>(recordFeedbackStep(input))
  },
)
