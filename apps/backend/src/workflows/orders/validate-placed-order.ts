import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { isVisiblePlacedOrder } from "./placed-order-visibility"
import { withOrderOperations } from "./order-operations-of"

const validatePlacedOrderStep = createStep(
  "validate-placed-order",
  async ({ order_id }: { order_id: string }, { container }) => {
    const order = await container
      .resolve(Modules.ORDER)
      .retrieveOrder(order_id, {
        select: ["id", "metadata"],
      })
    // Only a reviewed checkout needs its placement record looked up.
    const placed =
      isVisiblePlacedOrder(order) ||
      isVisiblePlacedOrder((await withOrderOperations(container, [order]))[0])
    if (!placed)
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
    return new StepResponse()
  },
)

export const validatePlacedOrderWorkflow = createWorkflow(
  "validate-placed-order",
  function (input: { order_id: string }) {
    validatePlacedOrderStep(input)
    return new WorkflowResponse(undefined)
  },
)
