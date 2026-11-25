"use server"

import { CUSTOMER_MENU_TEXT, isLocale } from "@dtc/i18n"
import { httpStatus } from "@dtc/logging"
import { sdk } from "@lib/config"
import { logUpstreamFailure } from "@lib/logger"
import { revalidateTag } from "next/cache"
import { getAuthHeaders, getCacheTag } from "./cookies"
import { getLocale } from "./locale-actions"

/** One reason the backend refused to complete the basket before payment. */
type BasketReviewIssue =
  | {
      code: "dish_changed"
      variant_id: string
      revision: number
      price: number
    }
  | { code: "dish_unavailable" | "dish_sold_out"; variant_id: string }
  | { code: "restaurant_not_receiving_orders"; reason: string }
  | { code: "amount_not_allowed"; reason: string }

/**
 * After completion refused the basket, asks the backend what needs review,
 * records the current facts of each changed dish as the ones the Customer now
 * reviews, and returns a message naming the dishes. The basket is kept: the
 * Customer checks the new total and places the order again.
 */
export async function explainBasketReview(cartId: string): Promise<string> {
  const locale = await getLocale()
  const text = CUSTOMER_MENU_TEXT[isLocale(locale) ? locale : "en"]
  const headers = await getAuthHeaders()
  try {
    const [{ issues }, cart] = await Promise.all([
      sdk.client.fetch<{ issues: BasketReviewIssue[] }>(
        `/store/carts/${cartId}/basket-review`,
        { method: "GET", headers, cache: "no-store" },
      ),
      sdk.store.cart
        .retrieve(cartId, { fields: "id,*items" }, headers)
        .then(({ cart }) => cart),
    ])
    const lineOf = (variantId: string) =>
      cart?.items?.find((item) => item.variant_id === variantId)
    const namesOf = (codes: BasketReviewIssue["code"][]) =>
      issues
        .flatMap((issue) =>
          codes.includes(issue.code) && "variant_id" in issue
            ? [lineOf(issue.variant_id)?.product_title ?? ""]
            : [],
        )
        .filter(Boolean)
        .join(", ")

    for (const issue of issues) {
      if (issue.code !== "dish_changed") continue
      const line = lineOf(issue.variant_id)
      if (!line) continue
      await sdk.store.cart.updateLineItem(
        cartId,
        line.id,
        {
          quantity: line.quantity,
          metadata: {
            ...line.metadata,
            mtogo_dish: { revision: issue.revision, price: issue.price },
          },
        },
        {},
        headers,
      )
    }

    const parts = [text.review_not_charged]
    const changed = namesOf(["dish_changed"])
    const unavailable = namesOf(["dish_unavailable", "dish_sold_out"])
    if (issues.some(({ code }) => code === "restaurant_not_receiving_orders"))
      parts.push(text.review_restaurant)
    if (unavailable)
      parts.push(text.review_dish_unavailable.replace("{dishes}", unavailable))
    if (changed)
      parts.push(text.review_dish_changed.replace("{dishes}", changed))
    if (issues.some(({ code }) => code === "amount_not_allowed"))
      parts.push(text.review_amount)
    return parts.length > 1 ? parts.join(" ") : text.review_required
  } catch (error) {
    logUpstreamFailure({ status: httpStatus(error) })
    return text.review_required
  } finally {
    revalidateTag(await getCacheTag("carts"), { expire: 0 })
  }
}
