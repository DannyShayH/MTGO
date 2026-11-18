import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  acquireLockStep,
  capturePaymentWorkflow,
  createRemoteLinkStep,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import {
  cartVariantIds,
  restaurantsOfVariants,
  ReviewedCart,
} from "../carts/review-basket"
import { recordPaidPlacementStep } from "../order-operations/steps/record-paid-placement"
import { hasPaidPlacement } from "./placed-order-visibility"

type Input = { order_id: string; cart_id: string }

type PlacementFacts = {
  placed: boolean
  restaurant_id: string
  payment_id: string
  captured: boolean
  linked: boolean
}

/** Read-only: decides what is still missing, so each write below is a compensable core step. */
const loadPlacementFactsStep = createStep(
  "load-placement-facts",
  async ({ order_id, cart_id }: Input, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const [{ data: carts }, { data: orders }] = await Promise.all([
      query.graph({
        entity: "cart",
        fields: ["id", "items.variant_id"],
        filters: { id: cart_id },
      }),
      query.graph({
        entity: "order",
        fields: [
          "id",
          "metadata",
          "order_operation.id",
          "restaurant.id",
          "payment_collections.payments.id",
          "payment_collections.payments.captured_at",
        ],
        filters: { id: order_id },
      }),
    ])
    const cart = carts[0] as ReviewedCart | undefined
    const order = orders[0] as unknown as
      | {
          metadata?: Record<string, unknown> | null
          order_operation?: { id: string } | null
          restaurant?: { id: string } | null
          payment_collections?: {
            payments?: { id: string; captured_at?: Date | string | null }[]
          }[]
        }
      | undefined
    if (!cart || !order)
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "order_not_found")
    if (hasPaidPlacement(order))
      return new StepResponse({ placed: true } as PlacementFacts)

    const variants = cartVariantIds(cart.items)
    const owners = await restaurantsOfVariants(container, variants)
    const restaurantIds = new Set(variants.map((id) => owners.get(id) ?? null))
    const payments =
      order.payment_collections?.flatMap(({ payments }) => payments ?? []) ?? []
    // A retry after a declined attempt may leave an older payment; the captured one wins.
    const payment = payments.find((p) => p.captured_at) ?? payments[0]
    if (restaurantIds.size !== 1 || restaurantIds.has(null) || !payment)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "order_placement_incomplete",
      )
    const restaurantId = [...restaurantIds][0] as string
    if (order.restaurant && order.restaurant.id !== restaurantId)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "order_restaurant_mismatch",
      )
    return new StepResponse({
      placed: false,
      restaurant_id: restaurantId,
      payment_id: payment.id,
      captured: !!payment.captured_at,
      linked: !!order.restaurant,
    })
  },
)

/**
 * Capture the mock payment, link the Restaurant, then expose the Order by
 * recording its paid placement. The cart lock also serializes a retried
 * post-completion capture and linking; a placed Order keeps its placement time
 * and deadline.
 */
export const placePaidRestaurantOrderWorkflow = createWorkflow(
  "place-paid-restaurant-order",
  function (input: Input) {
    acquireLockStep({ key: input.cart_id, timeout: 30, ttl: 120 })
    const facts = loadPlacementFactsStep(input)

    when("capture-needed", { facts }, ({ facts }) => {
      const f = facts as PlacementFacts
      return !f.placed && !f.captured
    }).then(() => {
      const capture = transform({ facts }, ({ facts }) => ({
        payment_id: (facts as PlacementFacts).payment_id,
      }))
      capturePaymentWorkflow.runAsStep({ input: capture })
    })

    when("link-needed", { facts }, ({ facts }) => {
      const f = facts as PlacementFacts
      return !f.placed && !f.linked
    }).then(() => {
      const link = transform({ facts, input }, ({ facts, input }) => [
        {
          [RESTAURANT_MODULE]: {
            restaurant_id: (facts as PlacementFacts).restaurant_id,
          },
          [Modules.ORDER]: { order_id: input.order_id },
        },
      ])
      createRemoteLinkStep(link)
    })

    when(
      "placement-record-needed",
      { facts },
      ({ facts }) => !(facts as PlacementFacts).placed,
    ).then(() => {
      const placement = transform({ facts, input }, ({ facts, input }) => ({
        order_id: input.order_id,
        restaurant_id: (facts as PlacementFacts).restaurant_id,
      }))
      recordPaidPlacementStep(placement)
    })

    releaseLockStep({ key: input.cart_id })
    return new WorkflowResponse(undefined)
  },
)
