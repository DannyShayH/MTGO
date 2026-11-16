import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { isVisiblePlacedOrder } from "./placed-order-visibility"

type Input = { order_id: string; customer_id: string }

const validateOrderOwnership = createStep(
  "validate-order-ownership",
  async (input: Input, { container }) => {
    const order = await container
      .resolve(Modules.ORDER)
      .retrieveOrder(input.order_id, {
        select: ["id", "customer_id", "metadata"],
      })
    if (
      !order.customer_id ||
      order.customer_id !== input.customer_id ||
      !isVisiblePlacedOrder(order)
    ) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
    }
    return new StepResponse()
  },
)

export const validateOrderOwnershipWorkflow = createWorkflow(
  "validate-order-ownership",
  (input: Input) => {
    validateOrderOwnership(input)
    return new WorkflowResponse(undefined)
  },
)
