import { BigNumberInput, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  BasketIssue,
  BasketLine,
  CurrentDish,
  DISH_SNAPSHOT_METADATA_KEY,
  parseDishSnapshot,
  reviewBasket,
  reviewBasketAmount,
} from "./basket-rules"
import { readRestaurantWithMenu } from "../menu/steps/read-menu"
import { withResponseFields } from "../common/response-fields"

type CartItem = {
  variant_id?: string | null
  quantity: number | string | { toString(): string }
  metadata?: Record<string, unknown> | null
}

/** The cart facts the review reads, as both Query and `completeCartWorkflow` give them. */
export type ReviewedCart = {
  completed_at?: string | Date | null
  currency_code?: string | null
  total?: BigNumberInput | null
  discount_total?: BigNumberInput | null
  shipping_total?: BigNumberInput | null
  items?: CartItem[] | null
  shipping_address?: { postal_code?: string | null } | null
  promotions?: unknown[] | null
  credit_lines?: unknown[] | null
  payment_collection?: {
    amount?: BigNumberInput | null
    currency_code?: string | null
    payment_sessions?:
      | {
          amount: BigNumberInput
          currency_code: string
          provider_id: string
          status: string
        }[]
      | null
  } | null
}

export const REVIEWED_CART_FIELDS = [
  "id",
  "completed_at",
  "currency_code",
  "total",
  "discount_total",
  "shipping_total",
  "items.variant_id",
  "items.quantity",
  "items.metadata",
  "shipping_address.postal_code",
  "promotions.id",
  "credit_lines.id",
  "payment_collection.amount",
  "payment_collection.currency_code",
  "payment_collection.payment_sessions.amount",
  "payment_collection.payment_sessions.currency_code",
  "payment_collection.payment_sessions.provider_id",
  "payment_collection.payment_sessions.status",
]

export type BasketReview = { restaurant_id: string; issues: BasketIssue[] }

const variantIdsOf = (items: { variant_id?: string | null }[]) =>
  items.flatMap(({ variant_id }) => (variant_id ? [variant_id] : []))

/** The Restaurant that owns each variant; absent for any other Product. */
export async function restaurantsOfVariants(
  container: MedusaContainer,
  variantIds: string[],
) {
  const owners = new Map<string, string | null>(
    variantIds.map((id) => [id, null]),
  )
  if (!variantIds.length) return owners
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.restaurant.id"],
    filters: { id: variantIds },
  })
  for (const variant of data as unknown as {
    id: string
    product?: { restaurant?: { id: string } | null } | null
  }[])
    owners.set(variant.id, variant.product?.restaurant?.id ?? null)
  return owners
}

/** The cart's variant ids, ignoring custom lines without a variant. */
export const cartVariantIds = (items?: CartItem[] | null) =>
  variantIdsOf(items ?? [])

export const basketRefusal = (
  code: string,
  type: string,
  fields?: Record<string, unknown>,
) => {
  const error = new MedusaError(type, code)
  return fields ? withResponseFields(error, fields) : error
}

const currentDishesOf = (
  found: Awaited<ReturnType<typeof readRestaurantWithMenu>>,
): CurrentDish[] =>
  (found?.menu ?? []).flatMap(({ dishes }) =>
    dishes.map((dish) => ({
      id: dish.id,
      variant_id: dish.variant_id,
      revision: dish.revision,
      price: dish.price.amount,
      is_sold_out: dish.is_sold_out,
    })),
  )

/**
 * Rechecks the whole basket against the Restaurant's current published menu,
 * its eligibility and the exact amount rules. It never edits the cart. A cart
 * with lines from several Restaurants or with a non-dish Product is refused.
 * Returns null for an empty or completed cart.
 */
export async function reviewCartBasket(
  container: MedusaContainer,
  cart: ReviewedCart,
  requirePayment = false,
): Promise<BasketReview | null> {
  // A completed cart returns its Order; the menu may have changed since.
  if (cart.completed_at || !cart.items?.length) return null
  const items = cart.items.flatMap((item) =>
    item.variant_id ? [{ ...item, variant_id: item.variant_id }] : [],
  )
  const owners = await restaurantsOfVariants(container, [
    ...new Set(variantIdsOf(items)),
  ])
  const restaurantIds = new Set(
    items.map(({ variant_id }) => owners.get(variant_id) ?? null),
  )
  if (restaurantIds.size !== 1 || restaurantIds.has(null))
    throw basketRefusal(
      restaurantIds.has(null) ? "basket_not_a_dish" : "basket_other_restaurant",
      MedusaError.Types.NOT_ALLOWED,
    )
  const [restaurantId] = [...restaurantIds] as string[]
  const found = await readRestaurantWithMenu(container, restaurantId)
  const lines: BasketLine[] = items.map((item) => ({
    variant_id: item.variant_id,
    quantity: Number(item.quantity.toString()),
    snapshot: parseDishSnapshot(item.metadata?.[DISH_SNAPSHOT_METADATA_KEY]),
  }))
  const payment = cart.payment_collection
  const issues = [
    ...reviewBasket(
      lines,
      currentDishesOf(found),
      {
        is_active: found?.restaurant.is_active ?? false,
        is_open: found?.restaurant.is_open ?? false,
        delivery_postal_codes: (
          found?.restaurant.delivery_area_postal_codes ?? []
        ).map(({ postal_code }) => postal_code),
      },
      cart.shipping_address?.postal_code ?? undefined,
    ),
    ...reviewBasketAmount({
      currency_code: cart.currency_code ?? "",
      total: cart.total ?? 0,
      discount_total: cart.discount_total,
      shipping_total: cart.shipping_total,
      promotion_count: cart.promotions?.length ?? 0,
      credit_line_count: cart.credit_lines?.length ?? 0,
      payment:
        payment?.amount != null
          ? {
              amount: payment.amount,
              currency_code: payment.currency_code ?? "",
              sessions: payment.payment_sessions ?? [],
            }
          : null,
      require_payment: requirePayment,
    }),
  ]
  return { restaurant_id: restaurantId, issues }
}

const reviewBasketStep = createStep(
  "review-basket",
  async ({ cart_id }: { cart_id: string }, { container }) => {
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "cart",
        fields: REVIEWED_CART_FIELDS,
        filters: { id: cart_id },
      })
    if (!data[0])
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "cart_not_found")
    const review = await reviewCartBasket(
      container,
      data[0] as unknown as ReviewedCart,
    )
    return new StepResponse(review ?? { restaurant_id: null, issues: [] })
  },
)

/**
 * The same review completion runs, read-only, so checkout can name what
 * changed and the Customer can review it again without losing the basket.
 */
export const reviewBasketWorkflow = createWorkflow(
  "review-basket",
  (input: { cart_id: string }) => new WorkflowResponse(reviewBasketStep(input)),
)
