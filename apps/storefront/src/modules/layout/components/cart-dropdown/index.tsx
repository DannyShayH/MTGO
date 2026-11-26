"use client"

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import { CUSTOMER_CART, formatDkk, type Locale } from "@dtc/i18n"
import { readBasketCart } from "@lib/util/read-basket-cart"
import { CART_UPDATED_EVENT } from "@lib/util/cart-events"
import { countBasketItems } from "@lib/util/basket"
import { removedLines, withPending } from "@lib/util/pending-cart"
import { usePendingCart } from "@lib/hooks/use-pending-cart"
import { ShoppingCart } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartIcon, {
  cartLinkClassName,
} from "@modules/layout/components/cart-icon"
import { usePathname } from "next/navigation"
import { Fragment, useEffect, useRef, useState } from "react"
import BasketLines, {
  useBasketDishes,
} from "@modules/cart/components/basket-lines"

const CartDropdown = ({
  cart: serverCart,
  label,
  locale,
}: {
  cart?: HttpTypes.StoreCart | null
  /** The header link's name in the Customer's language; the count follows it. */
  label: string
  locale: Locale
}) => {
  const text = CUSTOMER_CART[locale]
  // Statically rendered pages can't read the cart cookie, so the cart is
  // loaded in the browser; after a change it is read again here too, so the
  // badge settles on a read that holds the change (#203).
  const [cartState, setCartState] = useState<HttpTypes.StoreCart | null>(
    serverCart ?? null,
  )
  const { pending, track, hasPending } = usePendingCart()
  // A revalidated page may bring the server's cart while a change is still
  // counted here; that change's own read replaces it, without counting twice.
  const [renderedCart, setRenderedCart] = useState(serverCart)
  if (renderedCart !== serverCart) {
    setRenderedCart(serverCart)
    if (serverCart && !hasPending()) setCartState(serverCart)
  }
  const basketDishes = useBasketDishes(cartState)
  const [activeTimer, setActiveTimer] = useState<NodeJS.Timer | undefined>(
    undefined,
  )
  const [isOpen, setIsOpen] = useState(false)

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)

  const totalItems = countBasketItems(cartState)
  // The badge, the total and a removed line follow a tap at once; opening
  // by itself waits for the read.
  const shown = withPending(
    { count: totalItems, total: cartState?.total ?? 0 },
    pending,
  )
  const shownItems = shown.count
  const hiddenLines = removedLines(pending)
  const itemRef = useRef<number>(totalItems || 0)
  const hasServerCart = !!serverCart

  useEffect(() => {
    let isInitialLoad = !hasServerCart
    const load = () =>
      track(readBasketCart, (cart) => {
        if (isInitialLoad) {
          // Don't auto-open the dropdown for items that were already in the cart.
          itemRef.current = countBasketItems(cart)
          isInitialLoad = false
        }
        setCartState(cart)
      }).catch(() => {})

    if (!hasServerCart) void load()
    window.addEventListener(CART_UPDATED_EVENT, load)
    return () => window.removeEventListener(CART_UPDATED_EVENT, load)
  }, [hasServerCart, track])

  const timedOpen = () => {
    open()
    setActiveTimer(setTimeout(close, 5000))
  }

  const openAndCancel = () => {
    if (activeTimer) clearTimeout(activeTimer)
    open()
  }

  useEffect(() => {
    return () => {
      if (activeTimer) clearTimeout(activeTimer)
    }
  }, [activeTimer])

  const pathname = usePathname()

  // A menu confirms an added dish in its own stepper, so the basket only opens
  // by itself elsewhere; it would otherwise cover the dishes being chosen.
  useEffect(() => {
    if (
      itemRef.current !== totalItems &&
      !pathname.includes("/cart") &&
      !pathname.includes("/restaurants/")
    ) {
      timedOpen()
    }
    itemRef.current = totalItems
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems])

  const items = (cartState?.items ?? []).filter(
    ({ id }) => !hiddenLines.has(id),
  )

  return (
    <div
      className="h-full z-50"
      onMouseEnter={openAndCancel}
      onMouseLeave={close}
    >
      <Popover className="relative h-full">
        <PopoverButton className="h-full">
          <LocalizedClientLink
            className={cartLinkClassName}
            href="/cart"
            data-testid="nav-cart-link"
          >
            <CartIcon label={label} count={shownItems} />
          </LocalizedClientLink>
        </PopoverButton>
        <Transition
          show={isOpen}
          as={Fragment}
          // The panel grows out of the basket icon above its right corner and
          // leaves faster than it arrives.
          enter="transition-[opacity,transform] ease-out-strong duration-200"
          enterFrom="opacity-0 motion-safe:scale-[0.97] motion-safe:-translate-y-1"
          enterTo="opacity-100 scale-100 translate-y-0"
          leave="transition-[opacity,transform] ease-out-strong duration-150"
          leaveFrom="opacity-100 scale-100 translate-y-0"
          leaveTo="opacity-0 motion-safe:scale-[0.97] motion-safe:-translate-y-1"
        >
          {/* The top padding bridges the gap to the icon, so the pointer can
              travel from the icon to the panel without closing it. */}
          <PopoverPanel
            static
            className="absolute right-0 top-full hidden w-[380px] origin-top-right pt-2 text-mtogo-text-primary small:block"
            data-testid="nav-cart-dropdown"
          >
            <div className="overflow-hidden rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card shadow-lg">
              <div className="border-b border-mtogo-border-subtle px-4 py-3">
                <h3 className="text-base font-semibold">{text.basketTitle}</h3>
                {items.length > 0 && basketDishes && (
                  <p className="truncate text-sm text-mtogo-text-secondary">
                    {text.basketFrom.replace(
                      "{restaurant}",
                      basketDishes.restaurant.name,
                    )}
                  </p>
                )}
              </div>
              {cartState && items.length ? (
                <>
                  <div className="max-h-[360px] overflow-y-auto px-4 no-scrollbar">
                    <BasketLines
                      items={items}
                      dishes={basketDishes}
                      locale={locale}
                    />
                  </div>
                  <div className="flex flex-col gap-y-3 border-t border-mtogo-border-subtle p-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span>
                        <span className="block text-base font-semibold">
                          {text.total}
                        </span>
                        <span className="block text-sm text-mtogo-text-secondary">
                          {text.totalNote}
                        </span>
                      </span>
                      <span
                        className="text-large-semi tabular-nums"
                        data-testid="cart-subtotal"
                        data-value={shown.total}
                      >
                        {formatDkk(shown.total, locale)}
                      </span>
                    </div>
                    <LocalizedClientLink href="/cart" passHref>
                      <Button
                        className="w-full"
                        size="large"
                        data-testid="go-to-cart-button"
                      >
                        {text.goToBasket}
                      </Button>
                    </LocalizedClientLink>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-y-3 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mtogo-surface-selected text-mtogo-text-link">
                    <ShoppingCart aria-hidden="true" className="h-6 w-6" />
                  </div>
                  <span className="text-base font-medium">
                    {text.emptyBasket}
                  </span>
                  <span className="text-sm text-mtogo-text-secondary">
                    {text.emptyBasketNote}
                  </span>
                  <LocalizedClientLink href="/">
                    <Button onClick={close}>{text.findRestaurants}</Button>
                  </LocalizedClientLink>
                </div>
              )}
            </div>
          </PopoverPanel>
        </Transition>
      </Popover>
    </div>
  )
}

export default CartDropdown
