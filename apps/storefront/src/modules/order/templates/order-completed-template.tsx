import { CUSTOMER_ORDER_CONFIRMATION_TEXT, type Locale } from "@dtc/i18n"
import { HttpTypes } from "@medusajs/types"
import { CheckCircleSolid } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { CUSTOMER_ORDER_DETAIL_TEXT } from "@dtc/i18n"
import OrderDetailsTemplate from "./order-details-template"
import type { OrderProgressRead } from "@lib/data/orders"

/** The Order's Restaurant, from the Order or, for older Orders, its lines. */
function restaurantIdOfOrder(order: HttpTypes.StoreOrder) {
  const linked = (order as { restaurant?: { id?: string } | null }).restaurant
  const fromLine = order.items?.find(
    (item) => typeof item.metadata?.mtogo_restaurant_id === "string",
  )?.metadata?.mtogo_restaurant_id
  return linked?.id ?? (typeof fromLine === "string" ? fromLine : undefined)
}

export default function OrderCompletedTemplate({
  order,
  locale,
  progress,
}: {
  order: HttpTypes.StoreOrder
  locale: Locale
  progress: OrderProgressRead
}) {
  const text = CUSTOMER_ORDER_CONFIRMATION_TEXT[locale]
  const restaurantId = restaurantIdOfOrder(order)

  return (
    <main
      lang={locale}
      className="min-h-screen bg-mtogo-surface-page py-8 sm:py-12"
      data-testid="order-complete-container"
    >
      <div className="content-container max-w-3xl space-y-6">
        <header className="relative rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6 sm:p-8">
          <CheckCircleSolid
            className="mb-4 h-10 w-10 text-mtogo-text-link"
            aria-hidden="true"
          />
          {/* The progress card below states where the Order is; one status
              is enough (#252). */}
          <h1 className="break-words text-2xl font-semibold text-mtogo-text-primary sm:text-3xl">
            {text.title}
          </h1>
          <p className="mt-2 text-base text-mtogo-text-secondary">
            {text.explanation}
          </p>
          <p className="mt-5 text-sm font-medium text-mtogo-text-secondary">
            {text.reference}
          </p>
          {/* Large and selectable, to read out to support. */}
          <p
            className="select-all text-2xl font-semibold tabular-nums text-mtogo-text-primary"
            data-testid="order-id"
          >
            {order.display_id}
          </p>
        </header>
        <div className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6 sm:p-8">
          <OrderDetailsTemplate
            order={order}
            locale={locale}
            progress={progress}
            confirmation
          />
        </div>
        <nav className="flex flex-col gap-3 xsmall:flex-row xsmall:items-center">
          {restaurantId && (
            <LocalizedClientLink
              href={`/restaurants/${restaurantId}`}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-mtogo-action-primary px-6 text-base font-semibold text-mtogo-text-on-primary transition-[background-color,transform] duration-150 ease-out-strong active:scale-[0.97] active:bg-mtogo-action-primary-pressed motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-action-primary-hover"
              data-testid="order-again-link"
            >
              {text.orderAgain}
            </LocalizedClientLink>
          )}
          <LocalizedClientLink
            href="/account/orders"
            className="inline-flex min-h-12 items-center justify-center rounded-md px-4 text-sm font-semibold text-mtogo-text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring"
          >
            {CUSTOMER_ORDER_DETAIL_TEXT[locale].back}
          </LocalizedClientLink>
        </nav>
      </div>
    </main>
  )
}
