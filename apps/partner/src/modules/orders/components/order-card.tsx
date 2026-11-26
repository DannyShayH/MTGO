import Link from "next/link"
import {
  formatOrderDateTime,
  formatOrderTime,
  formatText,
  isSameOrderDay,
  ORDER_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Badge, Text } from "@medusajs/ui"
import { TriangleRightMini } from "@medusajs/icons"
import type { OrderView, RestaurantOrder } from "@lib/data/orders"
import {
  AcceptanceDeadline,
  DELIVERY_OUTCOME_COLORS,
  OrderStatusBadge,
} from "./order-status"
import { pickPurchasedName } from "./purchased-food"
import { REFUND_COLORS } from "./cancellation-outcome"
import { NewOrderMark } from "./arrival-alerts"
import { orderMoney } from "../money"

/**
 * The placement time, with the date when it was not today on the backend's
 * clock, so an Order left over from yesterday never reads as today's.
 */
export function placedLabel(
  placedAt: string,
  serverTime: string,
  locale: Locale,
  withDate = false,
) {
  return formatText(ORDER_TEXT[locale].placed, {
    time:
      withDate || !isSameOrderDay(placedAt, serverTime)
        ? formatOrderDateTime(placedAt, locale)
        : formatOrderTime(placedAt, locale),
  })
}

function DishSummary({
  order,
  locale,
}: Readonly<{ order: RestaurantOrder; locale: Locale }>) {
  const text = ORDER_TEXT[locale]
  return (
    <ul
      aria-label={text.items}
      className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5"
    >
      {order.items.map((item) => (
        <li key={item.id} className="min-w-0 break-words">
          <Text size="small" className="text-ui-fg-subtle">
            <span className="text-ui-fg-base font-medium tabular-nums">
              {formatText(text.item_count, { count: item.quantity })}
            </span>{" "}
            {pickPurchasedName(item, locale)}
          </Text>
        </li>
      ))}
    </ul>
  )
}

/**
 * One row of the queue, with the whole row as one link to the Order's
 * details. Awaiting rows lead with the deadline (their state goes without
 * saying in that view) and list every dish; In progress rows show the state;
 * History rows show the date, how the Order ended (delivered, not delivered
 * or why it was cancelled), the refund and the total, since staff look them
 * up after the fact.
 */
export function OrderCard({
  order,
  view,
  locale,
  serverTime,
}: {
  order: RestaurantOrder
  view: OrderView
  locale: Locale
  serverTime: string
}) {
  const text = ORDER_TEXT[locale]
  const reference = formatText(text.reference, { number: order.display_id })
  // An Order placed before placement times were recorded still has a date
  // in History: when it was cancelled.
  const when = order.placed_at
    ? placedLabel(order.placed_at, serverTime, locale, view === "history")
    : view === "history" && order.cancellation
      ? formatText(text.cancelled_on, {
          time: formatOrderDateTime(order.cancellation.cancelled_at, locale),
        })
      : null
  // A cancellation is why a cancelled Order ended, whatever its delivery did.
  const { outcome, ended_at } = order.delivery ?? {}
  const endedDelivery = !order.cancellation &&
    outcome &&
    ended_at && { outcome, ended_at }
  const placed = when && (
    <Text size="small" className="text-ui-fg-subtle tabular-nums">
      {when}
    </Text>
  )
  return (
    <li>
      <Link
        href={`/orders/${encodeURIComponent(order.id)}`}
        aria-label={formatText(text.open_order, { number: order.display_id })}
        className="hover:bg-ui-bg-base-hover active:bg-ui-bg-base-pressed focus-visible:ring-mtogo-focus-ring group relative isolate flex items-center gap-x-3 px-4 py-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-6"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Text weight="plus" className="txt-compact-large-plus">
                {reference}
              </Text>
              <NewOrderMark orderId={order.id} locale={locale} />
            </div>
            {view === "awaiting" && (
              <AcceptanceDeadline order={order} locale={locale} prominent />
            )}
            {view === "active" && (
              <OrderStatusBadge order={order} locale={locale} />
            )}
            {view === "history" && (
              <Text size="small" weight="plus" className="tabular-nums">
                {orderMoney(order, order.total_including_vat, locale)}
              </Text>
            )}
          </div>
          {view === "awaiting" ? (
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
          ) : view === "active" ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <DishSummary order={order} locale={locale} />
              {placed}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {placed}
                {order.cancellation && (
                  <Badge size="small" color="grey">
                    {text[`reason_${order.cancellation.category}`]}
                  </Badge>
                )}
                {endedDelivery && (
                  <Badge
                    size="small"
                    color={DELIVERY_OUTCOME_COLORS[endedDelivery.outcome]}
                    className="tabular-nums"
                  >
                    {formatText(text[`${endedDelivery.outcome}_at`], {
                      time:
                        order.placed_at &&
                        isSameOrderDay(endedDelivery.ended_at, order.placed_at)
                          ? formatOrderTime(endedDelivery.ended_at, locale)
                          : formatOrderDateTime(endedDelivery.ended_at, locale),
                    })}
                  </Badge>
                )}
                {order.refund && (
                  <Badge
                    size="small"
                    color={REFUND_COLORS[order.refund.status]}
                  >
                    {text[`refund_short_${order.refund.status}`]}
                  </Badge>
                )}
              </div>
              <DishSummary order={order} locale={locale} />
            </>
          )}
        </div>
        {/* Says "this opens"; nudges only where hover exists. */}
        <TriangleRightMini
          aria-hidden
          className="text-ui-fg-muted ease-out-strong shrink-0 transition-transform duration-150 [@media(hover:hover)]:group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  )
}
