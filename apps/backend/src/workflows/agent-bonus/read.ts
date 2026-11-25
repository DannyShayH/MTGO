import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { FEEDBACK_MODULE } from "../../modules/feedback"
import type FeedbackModuleService from "../../modules/feedback/service"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { requireAuthorizedDeliveryAgent } from "../delivery/agent-access"
import { financialBasisView } from "../order-operations/financial-basis"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../shared/copenhagen-time"
import { bonusPoints } from "./calculation"

const readAgentBonusStep = createStep(
  "read-agent-bonus",
  async (input: { agent_id: string }, { container }) => {
    await requireAuthorizedDeliveryAgent(container, input.agent_id)
    const now = new Date()
    const month = copenhagenMonthOf(now)
    const { starts_at, ends_at } = copenhagenMonthPeriod(month)
    const deliveries = await container
      .resolve<DeliveryModuleService>(DELIVERY_MODULE)
      .listIntendedDeliveries(
        {
          assigned_agent_id: input.agent_id,
          terminal_outcome: "delivered",
          terminal_at: { $gte: starts_at, $lt: ends_at },
        },
        {
          take: null,
          order: { terminal_at: "DESC", id: "DESC" },
          select: [
            "id",
            "order_id",
            "order_reference",
            "picked_up_at",
            "terminal_at",
          ],
        },
      )
    const ids = deliveries.map((delivery) => delivery.order_id)
    const [operations, feedback] = ids.length
      ? await Promise.all([
          container
            .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
            .listOrderOperations(
              { order_id: ids },
              {
                take: null,
                select: [
                  "order_id",
                  "restaurant_id",
                  "placed_at",
                  "financial_basis",
                ],
              },
            ),
          container
            .resolve<FeedbackModuleService>(FEEDBACK_MODULE)
            .listFeedbacks(
              { order_id: ids, agent_id: input.agent_id },
              { take: null, select: ["order_id", "agent_rating"] },
            ),
        ])
      : [[], []]
    const operationsByOrder = new Map(
      operations.map((operation) => [operation.order_id, operation]),
    )
    const ratingsByOrder = new Map(
      feedback.map((entry) => [entry.order_id, entry.agent_rating]),
    )
    const rows = deliveries.map((delivery) => {
      const operation = operationsByOrder.get(delivery.order_id)
      const basis =
        operation && financialBasisView(operation.financial_basis, operation)
      const calculation =
        basis?.status === "preserved" && delivery.picked_up_at
          ? bonusPoints(
              basis.food_value_including_vat,
              delivery.picked_up_at,
              ratingsByOrder.get(delivery.order_id) ?? null,
            )
          : null
      return {
        id: delivery.id,
        order_reference: delivery.order_reference,
        handover_at: delivery.terminal_at,
        picked_up_at: delivery.picked_up_at,
        calculation,
      }
    })
    return new StepResponse({
      month,
      calculated_at: now.toISOString(),
      status: "provisional" as const,
      deliveries: rows,
    })
  },
)

export const readAgentBonusWorkflow = createWorkflow(
  "read-agent-bonus",
  function (input: { agent_id: string }) {
    return new WorkflowResponse(readAgentBonusStep(input))
  },
)
