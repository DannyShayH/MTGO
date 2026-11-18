import Link from "next/link"
import {
  formatDkk,
  formatOrderTime,
  formatText,
  ORDER_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"
import { ArrowLeft } from "@medusajs/icons"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveOrder, type RestaurantOrder } from "@lib/data/orders"
import {
  AcceptanceDeadline,
  OrderStateBadge,
} from "@modules/orders/components/order-status"
import {
  PurchasedFood,
  pickPurchasedName,
} from "@modules/orders/components/purchased-food"
import { AcceptOrder } from "@modules/orders/components/accept-order"
import { LiveOrders } from "@modules/orders/components/live-orders"
import { RejectOrder } from "@modules/orders/components/reject-order"
import { CancellationOutcome } from "@modules/orders/components/cancellation-outcome"

/** Active kitchen work: only an operator can cancel it now (#49). */
const ACCEPTED_STATES = new Set(["accepted", "preparing", "ready"])

const LINK_CLASS =
  "focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center rounded border border-mtogo-border-control px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"

/** Prices are DKK including VAT; another currency is shown as the backend sent it. */
const money = (order: RestaurantOrder, amount: number, locale: Locale) =>
  order.currency_code === "dkk"
    ? formatDkk(amount, locale)
    : `${order.currency_code.toUpperCase()} ${amount}`

function BackLink({ locale }: { locale: Locale }) {
  return (
    <Link
      href="/orders"
      className="text-ui-fg-subtle hover:text-ui-fg-base focus-visible:ring-mtogo-focus-ring txt-compact-small-plus inline-flex min-h-11 items-center gap-x-1 self-start rounded focus-visible:outline-none focus-visible:ring-2"
    >
      <ArrowLeft />
      {ORDER_TEXT[locale].back}
    </Link>
  )
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  await requireCurrentStaff()
  const { locale } = await getMessages()
  const text = ORDER_TEXT[locale]
  const { orderId } = await params
  const result = await retrieveOrder(orderId)

  if (result === "not_found" || !result)
    return (
      <div className="flex flex-col gap-4">
        <BackLink locale={locale} />
        <Container className="rounded-card" role="alert">
          <Heading level="h1">
            {result ? text.not_found : text.unavailable}
          </Heading>
          <Text className="text-ui-fg-subtle mt-2">
            {result ? text.not_found_hint : text.retry_hint}
          </Text>
          {!result && (
            <Link
              href={`/orders/${encodeURIComponent(orderId)}`}
              className={`${LINK_CLASS} mt-4`}
            >
              {text.retry}
            </Link>
          )}
        </Container>
      </div>
    )

  const { order } = result
  return (
    <div className="flex flex-col gap-4">
      <BackLink locale={locale} />
      <header className="flex flex-wrap items-center gap-3">
        <Heading level="h1">
          {formatText(text.reference, { number: order.display_id })}
        </Heading>
        <OrderStateBadge state={order.state} locale={locale} />
      </header>
      <LiveOrders locale={locale} />
      <Container className="rounded-card flex flex-col gap-y-2 px-4 py-4 sm:px-6 sm:py-5">
        <AcceptanceDeadline order={order} locale={locale} detailed />
        {order.accepted_at && (
          <Text size="small" weight="plus">
            {formatText(text.accepted_at, {
              time: formatOrderTime(order.accepted_at, locale),
            })}
          </Text>
        )}
        {order.placed_at && (
          <Text size="small" className="text-ui-fg-subtle">
            {formatText(text.placed, {
              time: formatOrderTime(order.placed_at, locale),
            })}
          </Text>
        )}
        <Text size="small" className="text-ui-fg-subtle">
          {formatText(text.checked_at, {
            time: formatOrderTime(result.server_time, locale),
          })}
        </Text>
        <div className="mt-2 flex flex-col gap-4 empty:hidden sm:flex-row sm:items-start sm:justify-between">
          <AcceptOrder key={order.id} order={order} locale={locale} />
          <RejectOrder
            key={`${order.id}-reject`}
            order={order}
            locale={locale}
          />
        </div>
        {ACCEPTED_STATES.has(order.state) && (
          <Text size="small" className="text-ui-fg-subtle mt-2 max-w-prose">
            {formatText(text.operator_boundary, { number: order.display_id })}
          </Text>
        )}
      </Container>
      {order.cancellation && (
        <Container className="rounded-card px-4 py-4 sm:px-6 sm:py-5">
          <CancellationOutcome order={order} locale={locale} />
        </Container>
      )}
      <Container className="rounded-card px-4 py-4 sm:px-6 sm:py-5">
        <Heading level="h2">{text.items}</Heading>
        <table className="mt-3 w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="txt-compact-small-plus text-ui-fg-subtle border-ui-border-base border-b">
              <th scope="col" className="py-2 pr-2">
                {text.dish}
              </th>
              <th scope="col" className="w-16 py-2 pr-2 text-right sm:w-20">
                {text.quantity}
              </th>
              <th
                scope="col"
                className="hidden w-28 py-2 pr-2 text-right sm:table-cell"
              >
                {text.unit_price}
              </th>
              <th scope="col" className="w-28 py-2 text-right">
                {text.line_total}
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr
                key={item.id}
                className="border-ui-border-base txt-compact-small border-b align-top"
              >
                <td className="break-words py-3 pr-2 font-medium">
                  {pickPurchasedName(item, locale)}
                  <PurchasedFood item={item} locale={locale} />
                </td>
                <td className="py-3 pr-2 text-right tabular-nums">
                  {item.quantity}
                </td>
                <td className="hidden py-3 pr-2 text-right tabular-nums sm:table-cell">
                  {money(order, item.unit_price_including_vat, locale)}
                </td>
                <td className="py-3 text-right tabular-nums">
                  {money(order, item.total_including_vat, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="txt-compact-small-plus mt-3 flex justify-between gap-x-4">
          <span>{text.total}</span>
          <span className="tabular-nums">
            {money(order, order.total_including_vat, locale)}
          </span>
        </div>
      </Container>
    </div>
  )
}
