import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MathBN } from "@medusajs/framework/utils"
import {
  completeCartWorkflow,
  createPaymentSessionsWorkflow,
  refreshPaymentCollectionForCartWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MOCK_PAYMENT_PROVIDER_ID } from "../carts/basket-rules"
import { logMilestoneStep } from "../../observability/milestone-log"
import { placePaidRestaurantOrderWorkflow } from "./place-paid-restaurant-order"

const PLACED_ORDER_FIELDS = [
  "id",
  "display_id",
  "customer_id",
  "created_at",
  "currency_code",
  "total",
  "shipping_total",
  "email",
  "metadata",
  "shipping_address.*",
  "items.*",
  "payment_collections.payments.*",
  "restaurant.id",
  "order_operation.placed_at",
  "order_operation.acceptance_deadline",
]

type PaymentState = {
  total: number
  currency_code: string
  payment_collection?: {
    id: string
    amount: number
    currency_code: string
  } | null
}

/**
 * Keeps Medusa completion and MTOGO's paid placement in one workflow. A payment
 * collection that no longer matches the cart is refreshed and given a new
 * session first; completion then verifies the amount again under the cart lock.
 */
export const completeRestaurantCartWorkflow = createWorkflow(
  "complete-restaurant-cart",
  function (input: { cart_id: string }) {
    const { data: carts } = useQueryGraphStep({
      entity: "cart",
      fields: [
        "id",
        "total",
        "currency_code",
        "payment_collection.id",
        "payment_collection.amount",
        "payment_collection.currency_code",
      ],
      filters: { id: input.cart_id },
    }).config({ name: "load-payment-state" })

    const stale = transform({ carts }, ({ carts }) => {
      const cart = carts[0] as PaymentState | undefined
      const collection = cart?.payment_collection
      return (
        !!cart &&
        !!collection &&
        (!MathBN.eq(collection.amount, cart.total) ||
          collection.currency_code !== cart.currency_code)
      )
    })

    when("payment-collection-stale", { stale }, ({ stale }) => stale).then(
      () => {
        refreshPaymentCollectionForCartWorkflow.runAsStep({
          input: { cart_id: input.cart_id },
        })
        // Refreshing discards the old sessions, so the same mock option is offered again.
        const session = transform({ carts }, ({ carts }) => ({
          payment_collection_id: (carts[0] as PaymentState).payment_collection!
            .id,
          provider_id: MOCK_PAYMENT_PROVIDER_ID,
        }))
        createPaymentSessionsWorkflow.runAsStep({ input: session })
      },
    )

    const coreInput = transform({ input }, ({ input }) => ({
      id: input.cart_id,
    }))
    const order = completeCartWorkflow.runAsStep({ input: coreInput })
    const placementInput = transform({ input, order }, ({ input, order }) => ({
      cart_id: input.cart_id,
      order_id: order.id,
    }))
    const placement = placePaidRestaurantOrderWorkflow.runAsStep({
      input: placementInput,
    })

    const orderId = transform({ order }, ({ order }) => order.id)
    const { data: placed } = useQueryGraphStep({
      entity: "order",
      fields: PLACED_ORDER_FIELDS,
      filters: { id: orderId },
    }).config({ name: "load-placed-order" })
    // Last: a failure of any step above undoes the placement.
    logMilestoneStep({
      event: "order.placed",
      milestone: placement.milestone,
    })
    return new WorkflowResponse(
      transform({ placed }, ({ placed }) => placed[0]),
    )
  },
)
