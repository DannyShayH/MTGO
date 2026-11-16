import { CUSTOMER_CHECKOUT_TEXT, type Locale } from "@dtc/i18n"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

export default function CheckoutSummary({
  cart,
  locale,
}: {
  cart: HttpTypes.StoreCart
  locale: Locale
}) {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  const money = (amount: number) =>
    convertToLocale({
      amount,
      currency_code: cart.currency_code,
      locale: locale === "da" ? "da-DK" : "en-GB",
    })

  return (
    <aside
      aria-labelledby="checkout-basket-heading"
      className="h-fit rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-5 sm:sticky sm:top-6 sm:p-6"
    >
      <h2
        id="checkout-basket-heading"
        className="text-xl font-semibold text-mtogo-text-primary"
      >
        {text.basketSummary}
      </h2>
      <ul className="mt-4 divide-y divide-mtogo-border-subtle border-y border-mtogo-border-subtle">
        {cart.items?.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-4">
            <span className="min-w-0 break-words text-mtogo-text-primary">
              {item.quantity} × {item.title}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-mtogo-text-primary">
              {money(item.total ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between gap-4 font-semibold text-mtogo-text-primary">
        <span>{text.total}</span>
        <span
          className="text-xl tabular-nums"
          data-testid="cart-total"
          data-value={cart.total ?? 0}
        >
          {money(cart.total ?? 0)}
        </span>
      </div>
      <p className="mt-2 text-sm text-mtogo-text-secondary">
        {text.deliveryIncluded}
      </p>
    </aside>
  )
}
