import { CUSTOMER_ORDER_DETAIL_TEXT, formatText, type Locale } from "@dtc/i18n"
import { XCircle } from "@medusajs/icons"
import type { OrderProgress } from "@lib/data/orders"
import { convertToLocale } from "@lib/util/money"

const TIME_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  da: new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }),
}

const REFUND_TONE = {
  pending: "border-mtogo-border-subtle bg-mtogo-surface-page",
  failed:
    "border-transparent bg-mtogo-status-warning-surface text-mtogo-status-warning-text",
  succeeded:
    "border-transparent bg-mtogo-status-success-surface text-mtogo-status-success-text",
} as const

/**
 * The Customer's cancellation and refund outcome (#143), from the authorized
 * progress read. The cancellation is stated by its safe category, never the
 * Restaurant's free-text note, and the refund is a separate fact: a failed
 * refund says it is still owed instead of suggesting money came back.
 */
export default function OrderCancellation({
  progress,
  locale,
}: {
  progress: OrderProgress
  locale: Locale
}) {
  const { cancellation, refund } = progress
  if (!cancellation && !refund) return null
  const text = CUSTOMER_ORDER_DETAIL_TEXT[locale]
  // When it took effect: a timeout at its deadline, however much later
  // recovery processed it (#144).
  const time = cancellation
    ? TIME_FORMAT[locale].format(new Date(cancellation.effective_at))
    : null
  return (
    <section
      aria-labelledby="order-cancellation-heading"
      className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-5 sm:p-6"
      data-testid="order-cancellation"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mtogo-surface-selected text-mtogo-text-link">
          <XCircle aria-hidden="true" />
        </span>
        <h2 id="order-cancellation-heading" className="text-lg font-semibold">
          {cancellation ? text.cancellation : text.refund_heading}
        </h2>
      </div>
      {cancellation && time && (
        <p className="mt-3 max-w-prose text-sm leading-6">
          {formatText(text[`cancelled_${cancellation.category}`], { time })}
        </p>
      )}
      {refund && (
        <p
          role="status"
          className={`mt-4 max-w-prose rounded-lg border p-4 text-sm leading-6 ${REFUND_TONE[refund.status]}`}
        >
          {formatText(text[`refund_${refund.status}`], {
            amount: convertToLocale({
              amount: refund.amount_including_vat,
              currency_code: refund.currency_code,
              locale: locale === "da" ? "da-DK" : "en-GB",
            }),
          })}
        </p>
      )}
    </section>
  )
}
