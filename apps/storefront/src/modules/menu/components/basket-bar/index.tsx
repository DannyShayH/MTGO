"use client"

import { CUSTOMER_CART, formatDkk, type Locale } from "@dtc/i18n"
import { retrieveCart } from "@lib/data/cart"
import { countBasketItems } from "@lib/util/basket"
import { CART_UPDATED_EVENT } from "@lib/util/cart-events"
import { withPending } from "@lib/util/pending-cart"
import { usePendingCart } from "@lib/hooks/use-pending-cart"
import { ShoppingCart } from "@medusajs/icons"
import { clx, focusRing } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useEffect, useState } from "react"

type Summary = { count: number; total: number }

/**
 * The phone menu's way to the basket, as food delivery apps show it: a bar
 * fixed to the bottom with the item count and total once something is in
 * the basket. Wider screens use the header's basket dropdown instead. A tap
 * on a dish counts here at once, before the basket is read again (#203).
 */
export default function BasketBar({
  initial,
  locale,
}: {
  initial: Summary
  locale: Locale
}) {
  const text = CUSTOMER_CART[locale]
  const [loaded, setLoaded] = useState(initial)
  const { pending, track } = usePendingCart()
  const summary = withPending(loaded, pending)

  useEffect(() => {
    const load = () =>
      track(retrieveCart, (cart) =>
        setLoaded({
          count: countBasketItems(cart),
          total: Number(cart?.total ?? 0),
        }),
      ).catch(() => {})
    window.addEventListener(CART_UPDATED_EVENT, load)
    return () => window.removeEventListener(CART_UPDATED_EVENT, load)
  }, [track])

  if (summary.count === 0) return null

  return (
    <>
      {/* Keeps the last dish clear of the bar. */}
      <div aria-hidden="true" className="h-24 small:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] small:hidden">
        <LocalizedClientLink
          href="/cart"
          className={clx(
            "flex min-h-14 items-center gap-3 rounded-full bg-mtogo-action-primary px-5 text-mtogo-text-on-primary shadow-lg transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] active:bg-mtogo-action-primary-pressed motion-safe:animate-rise-in motion-reduce:transition-none",
            focusRing,
          )}
          data-testid="menu-basket-bar"
        >
          <span className="relative inline-flex">
            <ShoppingCart aria-hidden="true" className="h-6 w-6" />
            <span
              key={summary.count}
              aria-hidden="true"
              className="absolute -right-2.5 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mtogo-surface-card px-1 text-xs font-semibold leading-none text-mtogo-text-link motion-safe:animate-pop-in"
            >
              {summary.count > 99 ? "99+" : summary.count}
            </span>
          </span>
          <span className="flex-1 text-base font-semibold">
            {text.viewBasket}
            <span className="sr-only">
              {`, ${
                summary.count === 1
                  ? text.itemCountOne
                  : text.itemCount.replace("{count}", String(summary.count))
              }`}
            </span>
          </span>
          <span className="text-base font-semibold tabular-nums">
            {formatDkk(summary.total, locale)}
          </span>
        </LocalizedClientLink>
      </div>
    </>
  )
}
