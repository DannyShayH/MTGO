import {
  formatOrderDateTime,
  formatOrderTime,
  formatText,
  isSameOrderDay,
  ORDER_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Text, clx } from "@medusajs/ui"
import { CheckMini } from "@medusajs/icons"
import type { RestaurantOrder } from "@lib/data/orders"
import { orderTimelineSteps } from "../timeline-steps"

/**
 * The kitchen milestones the backend recorded, oldest first, as a vertical
 * line of steps. Placement carries its date; later steps only add the date
 * when they fell on another day. Done steps carry a check (design brief:
 * completed steps with a check, never by colour alone). `next` is the step
 * staff take now, such as Accept and Reject or Start preparing: it closes the
 * line as the current step, a teal ring, so the action sits where it will be
 * recorded. Without one, the newest step is a filled dot. The agent's
 * pickup (#254) follows Ready, and once the delivery has ended (#204), that
 * end closes the line.
 */
export function OrderTimeline({
  order,
  locale,
  next,
}: Readonly<{
  order: RestaurantOrder
  locale: Locale
  next?: React.ReactNode
}>) {
  const text = ORDER_TEXT[locale]
  const stepTime = (time: string) =>
    order.placed_at && isSameOrderDay(time, order.placed_at)
      ? formatOrderTime(time, locale)
      : formatOrderDateTime(time, locale)
  const labels = {
    placed: text.placed,
    accepted: text.accepted_at,
    preparation: text.preparation_started_at,
    ready: text.ready_at,
    picked_up: text.picked_up_at,
    delivered: text.delivered_at,
    not_delivered: text.not_delivered_at,
  }
  const steps = orderTimelineSteps(order).map(({ key, time }) => ({
    key,
    label: formatText(labels[key], {
      // Placement carries its date; later steps only on another day.
      time:
        key === "placed" ? formatOrderDateTime(time, locale) : stepTime(time),
    }),
  }))
  if (!steps.length && !next) return null
  return (
    <ol aria-label={text.timeline} className="flex flex-col">
      {steps.map((step, index) => {
        const isLatest = !next && index === steps.length - 1
        return (
          <li key={step.key} className="relative flex gap-x-3 pb-4 last:pb-0">
            {!isLatest && (
              <span
                aria-hidden
                className="bg-ui-border-base absolute bottom-0 left-[5px] top-5 w-px"
              />
            )}
            {isLatest ? (
              <span
                aria-hidden
                className="bg-mtogo-action-primary mt-1 size-[11px] shrink-0 rounded-full"
              />
            ) : (
              <span
                aria-hidden
                className="bg-ui-bg-base border-ui-border-strong text-ui-fg-subtle -ml-[3px] mt-0.5 inline-flex size-[17px] shrink-0 items-center justify-center rounded-full border"
              >
                <CheckMini className="size-3" />
              </span>
            )}
            <Text
              size="small"
              weight={isLatest ? "plus" : "regular"}
              className={clx("tabular-nums", !isLatest && "text-ui-fg-subtle")}
            >
              {step.label}
            </Text>
          </li>
        )
      })}
      {next && (
        <li className="flex gap-x-3">
          <span
            aria-hidden
            className="border-mtogo-action-primary bg-ui-bg-base -ml-[3px] mt-0.5 size-[17px] shrink-0 rounded-full border-[3px]"
          />
          <div className="min-w-0 flex-1">{next}</div>
        </li>
      )}
    </ol>
  )
}
