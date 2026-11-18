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

/**
 * The deadline as the backend decided it at read time. It only reports; it
 * never accepts, cancels or claims a later milestone (#140). A legacy Order
 * says its timing is unknown instead of showing an invented deadline.
 */
export function AcceptanceDeadline({
  order,
  locale,
  detailed = false,
}: {
  order: RestaurantOrder
  locale: Locale
  detailed?: boolean
}) {
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
        <Text size="small" weight="plus" className="text-ui-fg-subtle">
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
      size="small"
      weight="plus"
      className={clx(
        elapsed ? "text-ui-fg-subtle" : "text-mtogo-status-warning-text",
      )}
    >
      {formatText(elapsed ? text.window_elapsed : text.accept_by, { time })}
    </Text>
  )
}
