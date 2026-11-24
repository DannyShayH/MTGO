import { CUSTOMER_ORDER_CONFIRMATION_TEXT, type Locale } from "@dtc/i18n"
import { HttpTypes } from "@medusajs/types"
import { CheckCircleSolid } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { CUSTOMER_ORDER_DETAIL_TEXT } from "@dtc/i18n"
import OrderDetailsTemplate from "./order-details-template"
import type { OrderProgressRead } from "@lib/data/orders"

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
          <p className="inline-flex rounded-full bg-mtogo-status-success-surface px-3 py-1 text-sm font-semibold text-mtogo-status-success-text">
            {text.state}
          </p>
          <h1 className="mt-4 break-words text-2xl font-semibold text-mtogo-text-primary sm:text-3xl">
            {text.title}
          </h1>
          <p className="mt-2 text-base text-mtogo-text-secondary">
            {text.explanation}
          </p>
          <p className="mt-4 font-medium text-mtogo-text-primary">
            {text.reference}:{" "}
            <span data-testid="order-id">{order.display_id}</span>
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
        <LocalizedClientLink
          href="/account/orders"
          className="inline-flex min-h-12 items-center rounded-md px-4 text-sm font-semibold text-mtogo-text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring"
        >
          {CUSTOMER_ORDER_DETAIL_TEXT[locale].back}
        </LocalizedClientLink>
      </div>
    </main>
  )
}
