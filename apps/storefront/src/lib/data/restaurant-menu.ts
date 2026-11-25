import "server-only"
import { FetchError } from "@medusajs/js-sdk"
import { sdk } from "@lib/config"
import { logUpstreamFailure } from "@lib/logger"

type Bilingual = { da: string; en: string }

export type MenuDish = {
  /** Stable dish identity. */
  id: string
  /** The one sellable variant an Order line refers to. */
  variant_id: string
  revision: number
  name: Bilingual
  description: Bilingual | null
  /** Kroner including VAT and delivery, shown as given: 95.5 is DKK 95.50. */
  price: { amount: number; currency_code: "dkk"; includes_tax: true }
  is_sold_out: boolean
  photo: { url: string } | null
  food_information: {
    allergens:
      | { status: "unknown" }
      | {
          status: "supplied"
          contains: DeclaredAllergen[]
          may_contain: DeclaredAllergen[]
          none_declared: boolean
        }
    labels: {
      code: string
      name: Bilingual
      description: Bilingual
      state: "yes" | "no" | "unknown"
    }[]
  }
}

export type DeclaredAllergen = {
  number: number
  code: string
  name: Bilingual
  details: { code: string; name: Bilingual }[]
}

export type MenuCategory = {
  id: string
  revision: number
  name: Bilingual
  dishes: MenuDish[]
}

export type RestaurantMenu = {
  restaurant: {
    id: string
    name: string
    cover: { url: string } | null
    is_open: boolean
    receiving_new_orders: boolean
    reason: string | null
  }
  categories: MenuCategory[]
}

/**
 * The current menu of an active Restaurant, never from a cache, so a saved
 * change shows on the next visit. `null` when the Restaurant does not exist
 * or is not on MTOGO right now; any other failure is thrown.
 */
export async function retrieveRestaurantMenu(
  restaurantId: string,
): Promise<RestaurantMenu | null> {
  try {
    return await sdk.client.fetch<RestaurantMenu>(
      `/store/restaurants/${encodeURIComponent(restaurantId)}/menu`,
      { method: "GET", cache: "no-store" },
    )
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) return null
    logUpstreamFailure({
      status: error instanceof FetchError ? error.status : undefined,
    })
    throw error
  }
}
