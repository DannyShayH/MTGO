import Link from "next/link"
import { formatOrderTime, formatText, ORDER_TEXT, type Locale } from "@dtc/i18n"
import { Badge, Text } from "@medusajs/ui"
import type { RestaurantOrder } from "@lib/data/orders"
import { AcceptanceDeadline, OrderStateBadge } from "./order-status"
import { pickPurchasedName } from "./purchased-food"
import { REFUND_COLORS } from "./cancellation-outcome"

/**
 * One scannable queue entry: reference, state, deadline and purchased dishes,
 * with the whole card as one link to the Order's details.
 */
export function OrderCard({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  const text = ORDER_TEXT[locale]
  const reference = formatText(text.reference, { number: order.display_id })
  return (
    <li>
      <Link
        href={`/orders/${encodeURIComponent(order.id)}`}
        aria-label={formatText(text.open_order, { number: order.display_id })}
        className="rounded-card bg-ui-bg-base shadow-borders-base hover:bg-ui-bg-base-hover focus-visible:ring-mtogo-focus-ring flex flex-col gap-y-3 px-4 py-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:px-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="plus" className="txt-compact-large-plus">
            {reference}
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            {order.refund && (
              <Badge size="small" color={REFUND_COLORS[order.refund.status]}>
                {text[`refund_short_${order.refund.status}`]}
              </Badge>
            )}
            <OrderStateBadge state={order.state} locale={locale} />
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <AcceptanceDeadline order={order} locale={locale} />
          {order.placed_at && (
            <Text size="small" className="text-ui-fg-subtle">
              {formatText(text.placed, {
                time: formatOrderTime(order.placed_at, locale),
              })}
            </Text>
          )}
        </div>
        <ul aria-label={text.items} className="flex flex-col gap-y-1">
          {order.items.map((item) => (
            <li key={item.id} className="flex min-w-0 gap-x-2">
              <Text
                size="small"
                weight="plus"
                className="shrink-0 tabular-nums"
              >
                {formatText(text.item_count, { count: item.quantity })}
              </Text>
              <Text size="small" className="min-w-0 break-words">
                {pickPurchasedName(item, locale)}
              </Text>
            </li>
          ))}
        </ul>
      </Link>
    </li>
  )
}
