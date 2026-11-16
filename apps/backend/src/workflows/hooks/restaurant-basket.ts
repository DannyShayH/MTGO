import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  addToCartWorkflow,
  completeCartWorkflow,
} from "@medusajs/medusa/core-flows"
import { decideBasketAddition } from "../carts/basket-rules"
import {
  basketRefusal,
  cartVariantIds,
  restaurantsOfVariants,
  ReviewedCart,
  reviewCartBasket,
} from "../carts/review-basket"

/**
 * Direct Store API calls reach the same rule as the menu: a cart line must be
 * a dish of one Restaurant, so no UI control is needed to enforce it.
 */
addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const incoming = cartVariantIds(input.items)
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "cart",
      fields: ["id", "items.variant_id"],
      filters: { id: input.cart_id },
    })
  const existing = cartVariantIds((data[0] as ReviewedCart | undefined)?.items)
  const owners = await restaurantsOfVariants(container, [
    ...new Set([...incoming, ...existing]),
  ])
  const basket = existing.map((id) => owners.get(id) ?? null)
  for (const variantId of incoming) {
    const owner = owners.get(variantId) ?? null
    const decision = decideBasketAddition(basket, owner)
    if (decision === "not_a_dish")
      throw basketRefusal("basket_not_a_dish", MedusaError.Types.NOT_ALLOWED)
    if (decision === "other_restaurant")
      throw basketRefusal(
        "basket_other_restaurant",
        MedusaError.Types.NOT_ALLOWED,
        {
          current_restaurant_id: basket.find(Boolean),
          requested_restaurant_id: owner,
        },
      )
    basket.push(owner)
  }
})

/**
 * Before payment, recheck the whole basket against the Restaurant's current
 * published menu, eligibility and the exact amount rules. It only validates;
 * it never edits the cart.
 */
export async function validateReviewedBasket(
  container: MedusaContainer,
  cart: unknown,
  requirePayment = false,
) {
  const review = await reviewCartBasket(
    container,
    cart as ReviewedCart,
    requirePayment,
  )
  if (review?.issues.length)
    throw basketRefusal(
      "basket_review_required",
      MedusaError.Types.NOT_ALLOWED,
      {
        restaurant_id: review.restaurant_id,
        issues: review.issues,
      },
    )
}

completeCartWorkflow.hooks.validate(({ cart }, { container }) =>
  validateReviewedBasket(container, cart, true),
)
