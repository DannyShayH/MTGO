import type { ReactNode } from "react"
import {
  commissionTierLabel,
  formatExactDkk,
  formatExactPercent,
  formatOrderDateTime,
  formatText,
  ORDER_FINANCIAL_BASIS_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Badge, Heading, Text } from "@medusajs/ui"
import { InformationCircleSolid, TriangleDownMini } from "@medusajs/icons"
import type { FinancialBasis, RestaurantOrder } from "@lib/data/orders"
import { pickPurchasedName } from "./purchased-food"

type PreservedBasis = Extract<FinancialBasis, { status: "preserved" }>

/** Exact amounts in DKK; another currency is shown as the backend sent it. */
const formatExactMoney = (amount: string, currency: string, locale: Locale) =>
  currency === "dkk"
    ? formatExactDkk(amount, locale)
    : `${currency.toUpperCase()} ${amount}`

/** Long names and references wrap instead of widening the page. */
const WRAP = "min-w-0 break-words [overflow-wrap:anywhere]"
const SECTION = "flex flex-col gap-y-3 px-4 py-4 sm:px-6"

/** A label and its value on one row, as Medusa's detail panels show them. */
function Row({
  label,
  children,
  isKey = false,
}: {
  label: string
  children: ReactNode
  /** Prices and key facts use weight 600 (design brief). */
  isKey?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
      <dt className="txt-compact-small text-ui-fg-subtle">{label}</dt>
      <dd
        className={`${WRAP} txt-compact-small tabular-nums sm:text-right ${
          isKey ? "txt-compact-small-plus text-ui-fg-base" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  )
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <Heading level="h3" id={id} className="txt-compact-small-plus">
      {children}
    </Heading>
  )
}

function Preserved({
  basis,
  order,
  locale,
}: {
  basis: PreservedBasis
  order: RestaurantOrder
  locale: Locale
}) {
  const text = ORDER_FINANCIAL_BASIS_TEXT[locale]
  const money = (amount: string) =>
    formatExactMoney(amount, basis.currency_code, locale)
  const items = new Map(order.items.map((item) => [item.id, item]))
  const { terms } = basis
  const vat = formatExactPercent(terms.vat_rate, locale)
  const termsName =
    terms.terms_version === "common_mvp_v1"
      ? text.terms_common_mvp_v1
      : formatText(text.terms_unknown, { version: terms.terms_version })
  return (
    <>
      <section aria-labelledby="financial-basis-placement" className={SECTION}>
        <SectionHeading id="financial-basis-placement">
          {text.placement}
        </SectionHeading>
        <dl className="flex flex-col gap-y-2">
          <Row label={text.placed_at}>
            {formatOrderDateTime(basis.placed_at, locale)}
          </Row>
          <Row label={text.order_version}>{basis.order_version}</Row>
        </dl>
      </section>

      <section aria-labelledby="financial-basis-lines" className={SECTION}>
        <SectionHeading id="financial-basis-lines">{text.lines}</SectionHeading>
        <ul className="divide-ui-border-base flex flex-col divide-y">
          {basis.lines.map((line) => {
            const item = items.get(line.line_item_id)
            return (
              <li
                key={line.line_item_id}
                className="flex items-start justify-between gap-x-4 py-2 first:pt-0"
              >
                <span className={`${WRAP} flex flex-col`}>
                  <span className="txt-compact-small-plus">
                    {item ? pickPurchasedName(item, locale) : line.line_item_id}
                  </span>
                  <span className="txt-compact-small text-ui-fg-subtle tabular-nums">
                    {formatText(text.line_amount, {
                      quantity: line.quantity,
                      unit: money(line.unit_price_including_vat),
                    })}
                  </span>
                </span>
                <span className="txt-compact-small-plus shrink-0 tabular-nums">
                  {money(line.total_including_vat)}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="bg-ui-bg-subtle rounded-md px-3 py-3">
          <dl className="flex flex-col gap-y-2">
            <Row label={text.food_value_including_vat}>
              {money(basis.food_value_including_vat)}
            </Row>
            <Row label={text.food_value_excluding_vat} isKey>
              {money(basis.food_value_excluding_vat)}
            </Row>
          </dl>
          <Text size="xsmall" className="text-ui-fg-subtle mt-2 max-w-prose">
            {formatText(text.exact_hint, { rate: vat })}
          </Text>
        </div>
      </section>

      <section aria-labelledby="financial-basis-terms" className={SECTION}>
        <SectionHeading id="financial-basis-terms">{text.terms}</SectionHeading>
        <dl className="flex flex-col gap-y-2">
          <Row label={text.terms}>
            <span className="block">{termsName}</span>
            <span className="text-ui-fg-subtle block">
              {formatText(text.agreed_at, {
                date: formatOrderDateTime(terms.agreed_at, locale),
              })}
            </span>
          </Row>
          <Row label={text.vat}>{vat}</Row>
        </dl>
        <div className="flex flex-col gap-y-2">
          <Text size="small" weight="plus">
            {text.commission_tiers}
          </Text>
          <ul className="divide-ui-border-base border-ui-border-base divide-y overflow-hidden rounded-md border">
            {terms.commission_tiers.map((tier) => (
              <li
                key={tier.from_amount}
                className="txt-compact-small px-3 py-2 tabular-nums"
              >
                {commissionTierLabel(tier, locale)}
              </li>
            ))}
          </ul>
          <Text size="small" className="text-ui-fg-subtle max-w-prose">
            {text.commission_note}
          </Text>
        </div>
        <Text size="small" className="max-w-prose">
          {formatText(text.service_fee, {
            amount: formatExactMoney(
              terms.monthly_service_fee.amount,
              terms.monthly_service_fee.currency_code,
              locale,
            ),
          })}
        </Text>
      </section>
    </>
  )
}

function Note({ children }: { children: string }) {
  return (
    <div className="text-ui-fg-subtle flex items-start gap-x-2 px-4 py-3 sm:px-6">
      <InformationCircleSolid aria-hidden className="mt-0.5 shrink-0" />
      <Text size="xsmall" className="max-w-prose">
        {children}
      </Text>
    </div>
  )
}

/**
 * The Order's purchased financial terms (#226), collapsed by default below
 * the items, laid out as a Medusa detail panel: a header with the state and
 * the key figure, then divided sections. Rendered only when the backend sent
 * the field, so the partner app needs no flag of its own (ADR-0022). An
 * older Order without recorded facts says so instead of guessing.
 */
export function FinancialBasisDisclosure({
  order,
  locale,
}: {
  order: RestaurantOrder
  locale: Locale
}) {
  const basis = order.financial_basis
  if (!basis) return null
  const text = ORDER_FINANCIAL_BASIS_TEXT[locale]
  const isPreserved = basis.status === "preserved"
  return (
    <details className="group">
      <summary className="focus-visible:ring-mtogo-focus-ring hover:bg-ui-bg-base-hover flex min-h-11 cursor-pointer list-none items-center gap-x-3 px-4 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <Heading level="h2">{text.heading}</Heading>
            <Badge size="2xsmall" color={isPreserved ? "green" : "orange"}>
              {isPreserved ? text.status_preserved : text.status_unavailable}
            </Badge>
          </span>
          {isPreserved && (
            <Text size="small" className="text-ui-fg-subtle tabular-nums">
              {formatText(text.summary, {
                amount: formatExactMoney(
                  basis.food_value_excluding_vat,
                  basis.currency_code,
                  locale,
                ),
              })}
            </Text>
          )}
        </span>
        <TriangleDownMini
          aria-hidden
          className="text-ui-fg-subtle shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-ui-border-base divide-ui-border-base flex flex-col divide-y border-t">
        {isPreserved ? (
          <>
            <Text
              size="small"
              className="text-ui-fg-subtle max-w-prose px-4 py-4 sm:px-6"
            >
              {text.intro}
            </Text>
            <Preserved basis={basis} order={order} locale={locale} />
            <Note>{text.not_statement}</Note>
          </>
        ) : (
          <Text
            size="small"
            className="max-w-prose px-4 py-4 sm:px-6"
            role="status"
          >
            {text.unavailable}
          </Text>
        )}
      </div>
    </details>
  )
}
