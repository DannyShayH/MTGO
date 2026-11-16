"use server"

import { httpStatus } from "@dtc/logging"
import { sdk } from "@lib/config"
import { log } from "@lib/logger"
import { getAuthHeaders, getCacheTag } from "./cookies"
import { getOrSetCart, retrieveCart } from "./cart"
import { revalidateTag } from "next/cache"
import { BASKET_RESTAURANT_METADATA_KEY } from "@lib/util/basket"

export type AddDishResult =
  | { status: "added"; lineId: string; quantity: number }
  | { status: "other_restaurant" }
  | { status: "unavailable" }
  | { status: "error"; isBasketCleared: boolean }

type AddDishInput = {
  variantId: string
  /** Shown with the basket's dishes; the backend decides ownership itself. */
  restaurantId: string
  /** The revision and price the Customer saw; checked again before payment. */
  revision: number
  price: number
  countryCode: string
  /** Set only after the Customer chose to clear the basket and switch. */
  isSwitchConfirmed?: boolean
}

const codeOf = (error: unknown) => {
  const { message, code } = (error ?? {}) as { message?: string; code?: string }
  return code ?? message
}

/**
 * Adds one dish to the basket. The backend refuses another Restaurant's dish
 * and any non-dish Product, so this never decides that itself: it reports the
 * refusal and leaves the basket as it was. Clearing the basket happens only
 * when the Customer asked for it.
 */
export async function addDishToBasket({
  variantId,
  restaurantId,
  revision,
  price,
  countryCode,
  isSwitchConfirmed,
}: AddDishInput): Promise<AddDishResult> {
  let isCleared = false
  try {
    const headers = await getAuthHeaders()
    const cart = await getOrSetCart(countryCode)
    if (isSwitchConfirmed) {
      const current = await retrieveCart(cart.id, "id,*items", { fresh: true })
      for (const item of current?.items ?? [])
        await sdk.store.cart.deleteLineItem(cart.id, item.id, {}, headers)
      isCleared = true
    }
    const { cart: updated } = await sdk.store.cart.createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity: 1,
        metadata: {
          mtogo_dish: { revision, price },
          [BASKET_RESTAURANT_METADATA_KEY]: restaurantId,
        },
      },
      {},
      headers,
    )
    const line = updated.items?.find((item) => item.variant_id === variantId)
    return line
      ? { status: "added", lineId: line.id, quantity: line.quantity }
      : { status: "error", isBasketCleared: isCleared }
  } catch (error) {
    const code = codeOf(error)
    log("upstream.request.failed", { status: httpStatus(error) })
    if (code === "basket_other_restaurant")
      return { status: "other_restaurant" }
    if (code === "basket_not_a_dish") return { status: "unavailable" }
    return { status: "error", isBasketCleared: isCleared }
  } finally {
    // The basket may have changed even when the add failed.
    revalidateTag(await getCacheTag("carts"), { expire: 0 })
  }
}
