import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules, MedusaError } from "@medusajs/framework/utils"

type CartOwnershipInput = {
  cart_id: string
  actor_type?: string
  actor_id?: string
  require_customer_ownership?: boolean
}

const validateCartOwnershipStep = createStep(
  "validate-cart-ownership",
  async (
    {
      cart_id,
      actor_type,
      actor_id,
      require_customer_ownership,
    }: CartOwnershipInput,
    { container },
  ) => {
    let cart

    try {
      cart = await container.resolve(Modules.CART).retrieveCart(cart_id, {
        select: ["id", "customer_id"],
      })
    } catch (error) {
      if (
        error instanceof MedusaError &&
        error.type === MedusaError.Types.NOT_FOUND
      ) {
        return new StepResponse()
      }
      throw error
    }

    if (
      (!cart.customer_id && !require_customer_ownership) ||
      (actor_type === "customer" && actor_id === cart.customer_id)
    ) {
      return new StepResponse()
    }

    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "cart_customer_access_denied",
    )
  },
)

export const validateCartOwnershipWorkflow = createWorkflow(
  "validate-cart-ownership",
  (input: CartOwnershipInput) => {
    validateCartOwnershipStep(input)
    return new WorkflowResponse(undefined)
  },
)
