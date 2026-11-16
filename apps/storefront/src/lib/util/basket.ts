import type { HttpTypes } from "@medusajs/types"

/** Line metadata naming the Restaurant whose menu the dish was added from. */
export const BASKET_RESTAURANT_METADATA_KEY = "mtogo_restaurant_id"

/** The Restaurant of the basket, read from its newest line that records one. */
export const restaurantIdOfCart = (cart?: HttpTypes.StoreCart | null) => {
  for (const item of [...(cart?.items ?? [])].reverse()) {
    const id = item.metadata?.[BASKET_RESTAURANT_METADATA_KEY]
    if (typeof id === "string" && id) return id
  }
  return null
}

export const countBasketItems = (cart?: HttpTypes.StoreCart | null) =>
  cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
