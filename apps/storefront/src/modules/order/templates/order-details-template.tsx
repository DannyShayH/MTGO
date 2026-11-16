import { accountText } from "@lib/util/account-text"
import { CUSTOMER_ORDER_DETAIL_TEXT, type Locale } from "@dtc/i18n"
import { ArrowLeft, Calendar, MapPin, ShoppingBag } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { convertToLocale } from "@lib/util/money"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function OrderDetailsTemplate({
  order,
  locale,
}: {
  order: HttpTypes.StoreOrder
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  const address = order.shipping_address
  const account = accountText[locale]
  const statuses: Record<string, string> = {
    pending: account.pending,
    completed: account.completedStatus,
    canceled: account.canceled,
    archived: account.archived,
    requires_action: account.requiresAction,
  }
  const date = new Date(order.created_at).toLocaleDateString(
    locale === "da" ? "da-DK" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  )
  const total = convertToLocale({
    amount: order.total,
    currency_code: order.currency_code,
    locale: locale === "da" ? "da-DK" : "en-GB",
  })

  return (
    <div
      lang={locale}
      className="space-y-8"
      data-testid="order-details-container"
    >
      <LocalizedClientLink
        href="/account/orders"
        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-mtogo-text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
        data-testid="back-to-overview-button"
      >
        <ArrowLeft aria-hidden="true" />
        {text.back}
      </LocalizedClientLink>

      <header className="border-b border-mtogo-border-subtle pb-6">
        <p className="text-sm font-medium text-mtogo-text-secondary">
          {text.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-mtogo-text-primary">
            #{order.display_id}
          </h1>
          <span className="inline-flex items-center rounded-full bg-mtogo-surface-selected px-3 py-1 text-sm font-medium text-mtogo-text-link">
            {statuses[order.status] ?? order.status}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-mtogo-text-secondary">
          <Calendar aria-hidden="true" />
          <span>
            {text.date}:{" "}
            <time dateTime={new Date(order.created_at).toISOString()}>
              {date}
            </time>
          </span>
        </p>
      </header>

      <section aria-labelledby="order-items-heading">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mtogo-surface-selected text-mtogo-text-link">
            <ShoppingBag aria-hidden="true" />
          </span>
          <h2 id="order-items-heading" className="text-lg font-semibold">
            {text.items}
          </h2>
        </div>
        <ul
          className="mt-4 divide-y divide-mtogo-border-subtle border-y border-mtogo-border-subtle"
          data-testid="products-table"
        >
          {order.items?.map((item) => (
            <li key={item.id} className="flex items-start gap-4 py-4">
              <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md bg-mtogo-surface-page px-2 text-sm font-semibold text-mtogo-text-primary">
                {item.quantity} ×
              </span>
              <div className="min-w-0 break-words">
                <p className="font-medium">
                  {item.product_title || item.title}
                </p>
                {item.variant_title &&
                  item.variant_title !== item.product_title && (
                    <p className="mt-1 text-sm text-mtogo-text-secondary">
                      {item.variant_title}
                    </p>
                  )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-4 pt-5">
          <span className="font-semibold">{text.total}</span>
          <span className="text-xl font-semibold tabular-nums">{total}</span>
        </div>
      </section>

      <section
        aria-labelledby="order-delivery-heading"
        className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-page p-5 sm:p-6"
        data-testid="shipping-address-summary"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mtogo-surface-card text-mtogo-text-link">
            <MapPin aria-hidden="true" />
          </span>
          <h2 id="order-delivery-heading" className="text-lg font-semibold">
            {text.delivery}
          </h2>
        </div>
        <div className="mt-4 grid gap-5 text-sm leading-6 xsmall:grid-cols-2">
          <div className="min-w-0 break-words">
            <p className="font-medium">
              {address?.first_name} {address?.last_name}
            </p>
            <p>
              {address?.address_1} {address?.address_2}
            </p>
            <p>
              {address?.postal_code} {address?.city}
            </p>
            <p>{address?.country_code?.toUpperCase()}</p>
          </div>
          <div className="min-w-0 break-words">
            <h3 className="font-semibold">{text.contact}</h3>
            <p>{address?.phone}</p>
            <p>{order.email}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
