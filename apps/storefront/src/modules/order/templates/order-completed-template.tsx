import { CUSTOMER_ORDER_CONFIRMATION_TEXT, type Locale } from "@dtc/i18n"
import { HttpTypes } from "@medusajs/types"
import OrderDetailsTemplate from "./order-details-template"

export default function OrderCompletedTemplate({
  order,
  locale,
}: {
  order: HttpTypes.StoreOrder
  locale: Locale
}) {
  const text = CUSTOMER_ORDER_CONFIRMATION_TEXT[locale]

  return (
    <main
      lang={locale}
      className="min-h-screen bg-mtogo-surface-page py-8 sm:py-12"
      data-testid="order-complete-container"
    >
      <div className="content-container max-w-3xl space-y-6">
        <header className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6 sm:p-8">
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
          <OrderDetailsTemplate order={order} locale={locale} />
        </div>
      </div>
    </main>
  )
}
