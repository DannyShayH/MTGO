import {
  formatDkk,
  formatOrderTime,
  formatText,
  ORDER_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Badge, Heading, Text } from "@medusajs/ui"
import type { RestaurantOrder } from "@lib/data/orders"

/** One colour per refund outcome, shared by the details panel and queue cards. */
export const REFUND_COLORS = {
  pending: "orange",
  failed: "red",
  succeeded: "green",
} as const

const money = (amount: number, currency: string, locale: Locale) =>
  currency === "dkk"
    ? formatDkk(amount, locale)
    : `${currency.toUpperCase()} ${amount}`

/**
 * A cancelled Order's outcome (#143): why and when it was cancelled, the
 * staff member's own reason when one was given, and the refund kept apart
 * from the cancellation. A failed refund reads as still owed. A prepared-food
 * credit MTOGO owes the Restaurant (#162) is shown separately again.
 */
export function CancellationOutcome({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  const { cancellation, refund, food_credit } = order
  if (!cancellation) return null
  const text = ORDER_TEXT[locale]
  const amount =
    refund && money(refund.amount_including_vat, refund.currency_code, locale)
  return (
    <section
      aria-labelledby="cancellation-heading"
      className="flex flex-col gap-y-3"
    >
      <Heading level="h2" id="cancellation-heading">
        {text.cancellation}
      </Heading>
      <Text size="small" weight="plus">
        {formatText(text[`cancelled_${cancellation.category}`], {
          // When it took effect: a timeout at its deadline, however much
          // later recovery processed it (#144).
          time: formatOrderTime(cancellation.effective_at, locale),
          processed: formatOrderTime(cancellation.cancelled_at, locale),
        })}
      </Text>
      {cancellation.note && (
        <div className="flex flex-col gap-y-1">
          <Text size="small" className="text-ui-fg-subtle">
            {text.cancellation_note}
          </Text>
          <Text
            size="small"
            className="max-w-prose whitespace-pre-line break-words [overflow-wrap:anywhere]"
          >
            {cancellation.note}
          </Text>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-2" role="status">
        {refund ? (
          <>
            <Badge size="small" color={REFUND_COLORS[refund.status]}>
              {text.refund}
            </Badge>
            <Text size="small" className="min-w-0 flex-1 basis-60">
              {formatText(text[`refund_${refund.status}`], {
                amount: amount!,
              })}
            </Text>
          </>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            {text.refund_none}
          </Text>
        )}
      </div>
      {food_credit && (
        <Text size="small" className="max-w-prose">
          {formatText(text.food_credit_mtogo, {
            amount: money(
              food_credit.amount_excluding_vat,
              food_credit.currency_code,
              locale,
            ),
          })}
        </Text>
      )}
    </section>
  )
}
