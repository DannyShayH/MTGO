import { CUSTOMER_ORDER_CONFIRMATION_TEXT, type Locale } from "@dtc/i18n"
import { ChevronRight, ShoppingBag } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import { accountText } from "@lib/util/account-text"
import { convertToLocale } from "@lib/util/money"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function OrderRow({
  order,
  locale,
}: {
  order: HttpTypes.StoreOrder
  locale: Locale
}) {
  const text = accountText[locale]
  const statuses: Record<string, string> = {
    pending: text.pending,
    completed: text.completedStatus,
    canceled: text.canceled,
    archived: text.archived,
    requires_action: text.requiresAction,
  }
  const state =
    order.metadata?.mtogo_order_state === "awaiting_restaurant_acceptance" &&
    order.status === "pending"
      ? CUSTOMER_ORDER_CONFIRMATION_TEXT[locale].state
      : (statuses[order.status] ?? order.status)
  const itemCount = order.items?.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <LocalizedClientLink
      href={`/account/orders/details/${order.id}`}
      className="group flex min-w-0 items-center gap-4 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-4 transition-colors hover:bg-mtogo-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 sm:p-5"
      data-testid="open-order-button"
    >
      <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-mtogo-surface-selected text-mtogo-text-link items-center justify-center sm:h-16 sm:w-16">
        <ShoppingBag aria-hidden="true" className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3
            className="font-semibold text-mtogo-text-primary"
            data-testid="order-id"
            data-value={order.display_id}
          >
            {text.reference} #{order.display_id}
          </h3>
          <span
            className="font-semibold tabular-nums text-mtogo-text-primary"
            data-testid="order-amount"
          >
            {convertToLocale({
              amount: order.total,
              currency_code: order.currency_code,
              locale: locale === "da" ? "da-DK" : "en-GB",
            })}
          </span>
        </div>
        {itemCount != null && (
          <p className="mt-1 text-sm text-mtogo-text-secondary">
            {itemCount} {itemCount === 1 ? text.item : text.items}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <time
            className="text-mtogo-text-secondary"
            dateTime={new Date(order.created_at).toISOString()}
            data-testid="order-created-date"
          >
            {new Date(order.created_at).toLocaleDateString(
              locale === "da" ? "da-DK" : "en-GB",
              { day: "numeric", month: "short", year: "numeric" },
            )}
          </time>
          <span className="rounded-full bg-mtogo-surface-selected px-2.5 py-1 text-xs font-medium text-mtogo-text-link">
            {state}
          </span>
        </div>
      </div>
      <ChevronRight
        className="shrink-0 text-mtogo-text-link"
        aria-hidden="true"
      />
      <span className="sr-only">
        {text.details} #{order.display_id}
      </span>
    </LocalizedClientLink>
  )
}
