"use server"

import { retrieveRestaurantMenu } from "./restaurant-menu"

type Bilingual = { da: string; en: string }

export type BasketDishes = {
  restaurant: { id: string; name: string }
  /** The current name and photo of each dish, by its variant. */
  dishes: Record<string, { name: Bilingual; photoUrl: string | null }>
}

/**
 * The basket shows dishes as the menu does: their names in the Customer's
 * language and their photos, which live in MTOGO's photo store rather than
 * on the Medusa line item. `null` when the menu cannot be read.
 */
export async function retrieveBasketDishes(
  restaurantId: string,
): Promise<BasketDishes | null> {
  const menu = await retrieveRestaurantMenu(restaurantId).catch(() => null)
  if (!menu) return null
  return {
    restaurant: { id: menu.restaurant.id, name: menu.restaurant.name },
    dishes: Object.fromEntries(
      menu.categories.flatMap(({ dishes }) =>
        dishes.map((dish) => [
          dish.variant_id,
          { name: dish.name, photoUrl: dish.photo?.url ?? null },
        ]),
      ),
    ),
  }
}
