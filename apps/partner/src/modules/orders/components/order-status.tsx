import { formatOrderTime, formatText, ORDER_TEXT, type Locale } from "@dtc/i18n"
import { Badge, Text, clx } from "@medusajs/ui"
import type { OrderState, RestaurantOrder } from "@lib/data/orders"

const STATE_COLORS: Record<OrderState, "orange" | "blue" | "green" | "grey"> = {
  awaiting_acceptance: "orange",
  accepted: "blue",
  preparing: "blue",
  ready: "green",
  cancelled: "grey",
}

export function OrderStateBadge({
  state,
  locale,
}: {
  state: OrderState
  locale: Locale
}) {
  return (
    <Badge size="small" color={STATE_COLORS[state]}>
      {ORDER_TEXT[locale][`state_${state}`]}
    </Badge>
  )
}

export const DELIVERY_OUTCOME_COLORS = {
  delivered: "green",
  not_delivered: "orange",
} as const

/**
 * Where the Order stands for staff: how its delivery ended once it has
 * (#204), otherwise the kitchen state. A cancellation stays the outcome of a
 * cancelled Order.
 */
export function OrderStatusBadge({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  if (!order.delivery || order.cancellation)
    return <OrderStateBadge state={order.state} locale={locale} />
  const { outcome } = order.delivery
  return (
    <Badge size="small" color={DELIVERY_OUTCOME_COLORS[outcome]}>
      {ORDER_TEXT[locale][`outcome_${outcome}`]}
    </Badge>
  )
}

/**
 * The deadline as the backend decided it at read time. It only reports; it
 * never accepts, cancels or claims a later milestone (#140). A legacy Order
 * says its timing is unknown instead of showing an invented deadline.
 */
export function AcceptanceDeadline({
  order,
  locale,
  detailed = false,
  prominent = false,
}: {
  order: RestaurantOrder
  locale: Locale
  detailed?: boolean
  /** The awaiting queue leads with the deadline, so it is read first. */
  prominent?: boolean
}) {
  const size = prominent ? "base" : "small"
  const text = ORDER_TEXT[locale]
  // After acceptance or cancellation the deadline is history: shown in the
  // details only, as a plain fact rather than an instruction.
  if (order.state !== "awaiting_acceptance")
    return detailed && order.acceptance_deadline ? (
      <Text size="small" className="text-ui-fg-subtle">
        {formatText(text.deadline_was, {
          time: formatOrderTime(order.acceptance_deadline, locale),
        })}
      </Text>
    ) : null
  if (order.acceptance_window === "unavailable" || !order.acceptance_deadline)
    return (
      <div>
        <Text size={size} weight="plus" className="text-ui-fg-subtle">
          {text.timing_unavailable}
        </Text>
        {detailed && (
          <Text size="small" className="text-ui-fg-subtle mt-1 max-w-prose">
            {text.timing_unavailable_hint}
          </Text>
        )}
      </div>
    )
  const time = formatOrderTime(order.acceptance_deadline, locale)
  const elapsed = order.acceptance_window === "elapsed"
  return (
    <Text
      size={size}
      weight="plus"
      className={clx(
        "tabular-nums",
        elapsed ? "text-ui-fg-subtle" : "text-mtogo-status-warning-text",
      )}
    >
      {formatText(elapsed ? text.window_elapsed : text.accept_by, { time })}
    </Text>
  )
}
