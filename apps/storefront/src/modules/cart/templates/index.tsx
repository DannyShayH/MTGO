import { CUSTOMER_CART, formatDkk, type Locale } from "@dtc/i18n"
import { reachedCheckoutStep } from "@lib/util/checkout-step"
import type { BasketDishes } from "@lib/data/basket-dishes"
import { countBasketItems } from "@lib/util/basket"
import { Plus, ShoppingCart } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import BasketLines from "@modules/cart/components/basket-lines"
import { basketPressable } from "@modules/cart/components/basket-stepper"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx, focusRing } from "@modules/common/components/ui"

const card =
  "rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card"
const primaryLink = clx(
  "flex min-h-12 w-full items-center justify-center rounded-full bg-mtogo-action-primary px-6 text-base font-semibold text-mtogo-text-on-primary active:bg-mtogo-action-primary-pressed [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-action-primary-hover",
  basketPressable,
)

function EmptyBasket({ locale }: { locale: Locale }) {
  const text = CUSTOMER_CART[locale]
  return (
    <div
      className={clx(
        card,
        "mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-14 text-center",
      )}
      data-testid="empty-cart-message"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-mtogo-surface-selected text-mtogo-text-link">
        <ShoppingCart aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-xl font-semibold">{text.emptyBasket}</h1>
      <p className="text-base text-mtogo-text-secondary">
        {text.emptyBasketNote}
      </p>
      <LocalizedClientLink
        href="/"
        className={clx(primaryLink, "mt-3 w-auto")}
        data-testid="empty-cart-find-restaurants"
      >
        {text.findRestaurants}
      </LocalizedClientLink>
    </div>
  )
}

/**
 * The Customer's basket: the dishes of one Restaurant with the menu's
 * stepper, and one DKK total that already includes VAT and delivery. There is
 * no discount code or delivery charge, since checkout refuses both.
 */
export default function CartTemplate({
  cart,
  customer,
  locale,
  dishes,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  locale: Locale
  dishes: BasketDishes | null
}) {
  const text = CUSTOMER_CART[locale]
  const items = cart?.items ?? []
  const count = countBasketItems(cart)

  return (
    <div className="content-container py-8 small:py-12">
      <div className="mx-auto max-w-5xl" data-testid="cart-container">
        {!cart || !items.length ? (
          <EmptyBasket locale={locale} />
        ) : (
          <>
            <header className="mb-6 flex flex-col gap-1">
              <h1 className="text-2xl font-semibold small:text-3xl">
                {text.pageTitle}
              </h1>
              {dishes && (
                <LocalizedClientLink
                  href={`/restaurants/${dishes.restaurant.id}`}
                  className={clx(
                    "inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-base font-medium text-mtogo-text-link underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:hover:underline",
                    focusRing,
                  )}
                  data-testid="cart-add-more"
                >
                  <Plus aria-hidden="true" />
                  {text.addMore.replace("{restaurant}", dishes.restaurant.name)}
                </LocalizedClientLink>
              )}
            </header>
            <div className="grid items-start gap-6 small:grid-cols-[minmax(0,1fr)_340px]">
              <section className={clx(card, "px-4 small:px-6")}>
                <BasketLines
                  items={items}
                  dishes={dishes}
                  locale={locale}
                  isEditable
                />
              </section>
              <aside
                className={clx(
                  card,
                  "flex flex-col gap-4 p-5 small:sticky small:top-24",
                )}
                aria-labelledby="basket-summary-title"
              >
                <h2 id="basket-summary-title" className="text-lg font-semibold">
                  {text.summaryTitle}
                </h2>
                <dl className="flex flex-col gap-2 text-base">
                  <div className="flex justify-between gap-4">
                    <dt className="text-mtogo-text-secondary">
                      {text.food} (
                      {count === 1
                        ? text.itemCountOne
                        : text.itemCount.replace("{count}", String(count))}
                      )
                    </dt>
                    <dd className="tabular-nums">
                      {formatDkk(cart.item_total ?? 0, locale)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mtogo-text-secondary">
                      {text.delivery}
                    </dt>
                    <dd>{text.deliveryIncluded}</dd>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-mtogo-border-subtle pt-4">
                    <dt>
                      <span className="block font-semibold">{text.total}</span>
                      <span className="block text-sm text-mtogo-text-secondary">
                        {text.totalNote}
                      </span>
                    </dt>
                    <dd
                      className="text-xl font-semibold tabular-nums"
                      data-testid="cart-total"
                      data-value={cart.total ?? 0}
                    >
                      {formatDkk(cart.total ?? 0, locale)}
                    </dd>
                  </div>
                </dl>
                {!customer && (
                  <p className="rounded-md bg-mtogo-surface-selected px-3 py-2 text-sm text-mtogo-text-primary">
                    {text.signInNote}
                  </p>
                )}
                <LocalizedClientLink
                  href={`/checkout?step=${reachedCheckoutStep(cart)}`}
                  // Phones use the bar fixed to the bottom instead.
                  className={clx(primaryLink, "hidden small:flex")}
                  data-testid="checkout-button"
                >
                  {text.goToCheckout}
                </LocalizedClientLink>
              </aside>
            </div>
            {/* On a phone the summary scrolls away, so checkout stays at hand. */}
            <div aria-hidden="true" className="h-24 small:hidden" />
            <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] small:hidden">
              <LocalizedClientLink
                href={`/checkout?step=${reachedCheckoutStep(cart)}`}
                className={clx(
                  primaryLink,
                  "min-h-14 justify-between shadow-lg motion-safe:animate-rise-in",
                )}
                data-testid="checkout-bar"
              >
                <span>{text.goToCheckout}</span>
                <span className="tabular-nums">
                  {formatDkk(cart.total ?? 0, locale)}
                </span>
              </LocalizedClientLink>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
