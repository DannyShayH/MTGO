import { CUSTOMER_ORDER_DETAIL_TEXT, type Locale } from "@dtc/i18n"
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
  return (
    <div
      lang={locale}
      className="flex flex-col gap-6"
      data-testid="order-details-container"
    >
      <LocalizedClientLink
        href="/account/orders"
        className="underline"
        data-testid="back-to-overview-button"
      >
        {text.back}
      </LocalizedClientLink>
      <h1 className="text-2xl-semi">
        {text.title} #{order.display_id}
      </h1>
      <p>
        {text.date}:{" "}
        {new Date(order.created_at).toLocaleDateString(
          locale === "da" ? "da-DK" : "en-GB",
        )}
      </p>
      <section>
        <h2 className="text-large-semi">{text.items}</h2>
        <ul className="mt-2 space-y-2" data-testid="products-table">
          {order.items?.map((item) => (
            <li key={item.id}>
              {item.quantity} × {item.product_title || item.title}
              {item.variant_title &&
                item.variant_title !== item.product_title && (
                  <span> — {item.variant_title}</span>
                )}
            </li>
          ))}
        </ul>
      </section>
      <section data-testid="shipping-address-summary">
        <h2 className="text-large-semi">{text.delivery}</h2>
        <p>
          {address?.first_name} {address?.last_name}
        </p>
        <p>
          {address?.address_1} {address?.address_2}
        </p>
        <p>
          {address?.postal_code} {address?.city}
        </p>
        <p>{address?.country_code?.toUpperCase()}</p>
        <h3 className="font-semibold mt-2">{text.contact}</h3>
        <p>{address?.phone}</p>
        <p>{order.email}</p>
      </section>
      <p className="font-semibold">
        {text.total}:{" "}
        {convertToLocale({
          amount: order.total,
          currency_code: order.currency_code,
          locale: locale === "da" ? "da-DK" : "en-GB",
        })}
      </p>
    </div>
  )
}
