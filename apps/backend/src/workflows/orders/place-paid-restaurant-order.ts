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
import type RestaurantModuleService from "../../modules/restaurant/service"
import {
  cartVariantIds,
  restaurantsOfVariants,
  ReviewedCart,
} from "../carts/review-basket"
import { recordPaidPlacementStep } from "../order-operations/steps/record-paid-placement"
import {
  readFrozenPurchase,
  PurchasedItem,
} from "../order-operations/purchased-items"
import {
  captureFinancialBasis,
  type PlacedOrder,
  type StoredFinancialBasis,
} from "../order-operations/financial-basis"
import { consumePurchaseReviewStep } from "../order-operations/steps/consume-purchase-review"
import { markPaidPlacementsStep } from "../order-operations/steps/mark-paid-placements"
import { hasPaidPlacement } from "./placed-order-visibility"

type Input = { order_id: string; cart_id: string }

type PlacementFacts = {
  placed: boolean
  restaurant_id: string
  payment_id: string
  captured: boolean
  linked: boolean
  purchased_items: PurchasedItem[] | null
  purchase_review_id: string | null
  financial_basis: StoredFinancialBasis | null
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
          // The purchase as placed, for its financial basis (#226).
          "version",
          "currency_code",
          "items.id",
          "items.variant_id",
          "items.raw_unit_price",
          "items.is_tax_inclusive",
          "items.quantity",
        ],
        filters: { id: order_id },
      }),
    ])
    const cart = carts[0] as ReviewedCart | undefined
    const order = orders[0] as unknown as
      | (PlacedOrder & {
          metadata?: Record<string, unknown> | null
          order_operation?: { id: string } | null
          restaurant?: { id: string } | null
          payment_collections?: {
            payments?: { id: string; captured_at?: Date | string | null }[]
          }[]
        })
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
    // Frozen when completion reviewed the basket; never reread from the menu.
    const frozen = await readFrozenPurchase(container, cart_id)
    // The terms in force now, at placement, are the ones this purchase keeps.
    const [agreement] = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listCommercialTermsAgreements(
        { restaurant_id: restaurantId },
        { select: ["id", "terms_version", "agreed_at"], take: 1 },
      )
    const financialBasis = captureFinancialBasis(order, agreement ?? null)
    // A new placement that cannot preserve its basis is an evidence problem,
    // not a reason to refuse a paid Order (spec #52 §2): it stays visible.
    if (!financialBasis)
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          `financial_basis_unavailable order_id=${order_id} restaurant_id=${restaurantId}`,
        )
    return new StepResponse({
      placed: false,
      restaurant_id: restaurantId,
      payment_id: payment.id,
      captured: !!payment.captured_at,
      linked: !!order.restaurant,
      purchased_items: frozen?.items ?? null,
      purchase_review_id: frozen?.id ?? null,
      financial_basis: financialBasis,
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
        purchased_items: (facts as PlacementFacts).purchased_items,
        financial_basis: (facts as PlacementFacts).financial_basis,
      }))
      const record = recordPaidPlacementStep(placement)
      // Order lists filter on this copy of the record (#154).
      markPaidPlacementsStep(
        transform({ record, input }, ({ record, input }) => [
          { order_id: input.order_id, order_operation_id: record.id },
        ]),
      )
      const review = transform({ facts }, ({ facts }) => ({
        id: (facts as PlacementFacts).purchase_review_id,
      }))
      consumePurchaseReviewStep(review)
    })

    releaseLockStep({ key: input.cart_id })
    return new WorkflowResponse(undefined)
  },
)
