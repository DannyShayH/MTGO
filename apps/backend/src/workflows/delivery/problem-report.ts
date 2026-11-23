import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { ProblemCategory } from "../../modules/delivery/models/delivery-attention"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { underDeliveryGuard } from "./delivery-guard"

type Input = {
  order_id: string
  agent_id: string
  category: ProblemCategory
  note: string | null
}

/**
 * A committed report is the agent's first durable statement to operators.
 * It has no compensation: a later failure must not erase or replace it.
 * Creation raises attention in the same transaction, so no follow-up is owed.
 */
const reportProblemStep = createStep(
  "report-problem",
  async (input: Input, { container }) => {
    const result = await underDeliveryGuard(
      container,
      input,
      ({ order_active, now }) =>
        container
          .resolve<DeliveryModuleService>(DELIVERY_MODULE)
          .reportProblem({
            ...input,
            order_active,
            now,
          }),
    )
    const { attention } = result
    return new StepResponse({
      status: result.isCreated
        ? ("reported" as const)
        : ("already_reported" as const),
      report: {
        id: attention.id,
        order_id: attention.order_id,
        category: attention.category,
        note: attention.note,
        reported_by: attention.reported_by,
        reported_at: new Date(attention.raised_at as Date).toISOString(),
      },
    })
  },
)

export const reportDeliveryProblemWorkflow = createWorkflow(
  "report-delivery-problem",
  function (input: Input) {
    return new WorkflowResponse(reportProblemStep(input))
  },
)
