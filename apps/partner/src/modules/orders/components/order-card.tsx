import Link from "next/link"
import { formatOrderTime, formatText, ORDER_TEXT, type Locale } from "@dtc/i18n"
import { Badge, Text } from "@medusajs/ui"
import type { OrderView, RestaurantOrder } from "@lib/data/orders"
import { AcceptanceDeadline, OrderStateBadge } from "./order-status"
import { pickPurchasedName } from "./purchased-food"
import { REFUND_COLORS } from "./cancellation-outcome"
import { NewOrderMark } from "./arrival-alerts"

/**
 * One scannable queue entry, with the whole card as one link to the Order's
 * details. Awaiting cards lead with the deadline (their state goes without
 * saying in that view) and list every dish; In progress and History cards
 * are denser, with the dishes on one line, so a long list stays scannable.
 */
export function OrderCard({
  order,
  view,
  locale,
}: {
  order: RestaurantOrder
  view: OrderView
  locale: Locale
}) {
  const text = ORDER_TEXT[locale]
  const reference = formatText(text.reference, { number: order.display_id })
  const isAwaitingView = view === "awaiting"
  const placed = order.placed_at && (
    <Text size="small" className="text-ui-fg-subtle tabular-nums">
      {formatText(text.placed, {
        time: formatOrderTime(order.placed_at, locale),
      })}
    </Text>
  )
  return (
    <li>
      <Link
        href={`/orders/${encodeURIComponent(order.id)}`}
        aria-label={formatText(text.open_order, { number: order.display_id })}
        className={`rounded-card bg-ui-bg-base shadow-borders-base hover:bg-ui-bg-base-hover focus-visible:ring-mtogo-focus-ring ease-out-strong relative isolate flex flex-col px-4 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:active:scale-[0.99] sm:px-5 ${
          isAwaitingView ? "gap-y-3 py-4" : "gap-y-2 py-3"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text weight="plus" className="txt-compact-large-plus">
              {reference}
            </Text>
            <NewOrderMark orderId={order.id} locale={locale} />
          </div>
          {isAwaitingView ? (
            <AcceptanceDeadline order={order} locale={locale} prominent />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {order.refund && (
                <Badge size="small" color={REFUND_COLORS[order.refund.status]}>
                  {text[`refund_short_${order.refund.status}`]}
                </Badge>
              )}
              <OrderStateBadge state={order.state} locale={locale} />
            </div>
          )}
        </div>
        {isAwaitingView ? (
          <>
            {placed}
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
          </>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <ul
              aria-label={text.items}
              className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5"
            >
              {order.items.map((item) => (
                <li key={item.id} className="min-w-0 break-words">
                  <Text size="small">
                    <span className="font-medium tabular-nums">
                      {formatText(text.item_count, { count: item.quantity })}
                    </span>{" "}
                    {pickPurchasedName(item, locale)}
                  </Text>
                </li>
              ))}
            </ul>
            {placed}
          </div>
        )}
      </Link>
    </li>
  )
}
