import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { OPEN_ORDER_STAGES } from "../../modules/order-operation/service"

/** The whole platform, or one Restaurant's own figures. */
export type OperationsScope =
  { type: "platform" } | { type: "restaurant"; restaurant_id: string }

export type OperationsInput = {
  scope: OperationsScope
  /** The one moment every measure is calculated for, as ISO text. */
  now: string
}

const readOpenOrdersStep = createStep(
  "read-open-orders",
  async (input: OperationsInput, { container }) => {
    const counts = await container
      .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
      .countOpenOrdersByStage(
        input.scope.type === "restaurant"
          ? { restaurant_id: input.scope.restaurant_id }
          : {},
      )
    const stages = OPEN_ORDER_STAGES.map((stage) => ({
      stage,
      count: counts[stage],
    }))
    const as_of = new Date(input.now).toISOString()
    return new StepResponse({
      as_of,
      scope: input.scope,
      open_orders: {
        // A state at one moment, not a range of time.
        period: { at: as_of },
        total: stages.reduce((sum, { count }) => sum + count, 0),
        stages,
        // Being open needs no recorded time, so no Order is left out.
        exclusions: [],
      },
    })
  },
)

/**
 * The operations read (#54), the only entry point for the operator and
 * staff views. It takes a scope and one explicit `now` and derives every
 * period from it, so each response states the moment it describes. Each
 * owning module aggregates its own records in the database; this workflow
 * only combines them. #259 adds Open Orders by stage.
 */
export const readOperationsWorkflow = createWorkflow(
  "read-operations",
  function (input: OperationsInput) {
    return new WorkflowResponse(readOpenOrdersStep(input))
  },
)
