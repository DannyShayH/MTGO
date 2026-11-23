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

/**
 * The kitchen milestones the backend recorded, oldest first, as a vertical
 * line of steps. Placement carries its date; later steps only add the date
 * when they fell on another day. Done steps carry a check (design brief:
 * completed steps with a check, never by colour alone). `next` is the step
 * staff take now, such as Accept and Reject or Start preparing: it closes the
 * line as the current step, a teal ring, so the action sits where it will be
 * recorded. Without one, the newest step is a filled dot. Once the delivery
 * has ended (#204), that end closes the line.
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
  const steps = (
    [
      order.placed_at && {
        key: "placed",
        label: formatText(text.placed, {
          time: formatOrderDateTime(order.placed_at, locale),
        }),
      },
      order.accepted_at && {
        key: "accepted",
        label: formatText(text.accepted_at, {
          time: stepTime(order.accepted_at),
        }),
      },
      order.preparation_started_at && {
        key: "preparation",
        label: formatText(text.preparation_started_at, {
          time: stepTime(order.preparation_started_at),
        }),
      },
      order.ready_at && {
        key: "ready",
        label: formatText(text.ready_at, { time: stepTime(order.ready_at) }),
      },
      order.delivery && {
        key: "delivery",
        label: formatText(text[`${order.delivery.outcome}_at`], {
          time: stepTime(order.delivery.ended_at),
        }),
      },
    ] as const
  ).filter((step) => !!step)
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
