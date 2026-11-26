import Link from "next/link"
import {
  formatOrderTime,
  formatText,
  ORDER_TEXT,
  RESTAURANT_RATINGS_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"
import { ArrowLeft, Star } from "@medusajs/icons"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveOrder } from "@lib/data/orders"
import {
  AcceptanceDeadline,
  OrderStatusBadge,
} from "@modules/orders/components/order-status"
import {
  PurchasedFood,
  pickPurchasedName,
} from "@modules/orders/components/purchased-food"
import { OrderProgressAction } from "@modules/orders/components/order-progress-action"
import { LiveOrders } from "@modules/orders/components/live-orders"
import { RejectOrder } from "@modules/orders/components/reject-order"
import { CancellationOutcome } from "@modules/orders/components/cancellation-outcome"
import { OrderTimeline } from "@modules/orders/components/order-timeline"
import { orderMoney as money } from "@modules/orders/money"
import { FinancialBasisDisclosure } from "@modules/orders/components/financial-basis"

/** Active kitchen work: only an operator can cancel it now (#49), until its delivery ends. */
const ACCEPTED_STATES = new Set(["accepted", "preparing", "ready"])

const LINK_CLASS =
  "focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center rounded border border-mtogo-border-control px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"

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
  const isAwaiting = order.state === "awaiting_acceptance"
  const hasNextStep = order.available_actions.some(
    (action) => action !== "reject",
  )
  // After handover, or a delivery that ended without it, nothing is left
  // for the kitchen or the agent (#204): the timeline ends with that outcome.
  const isDeliveryEnded = !!order.delivery?.outcome
  const isAwaitingPickup =
    order.state === "ready" && !order.delivery?.picked_up_at && !isDeliveryEnded
  // After pickup (#254) the food has left; only the agent's handover is left.
  // A cancellation recorded before the delivery's end reached the Order
  // (owed work, #204) must not still say the food is on its way.
  const isOnItsWay =
    !!order.delivery?.picked_up_at && !isDeliveryEnded && !order.cancellation
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <BackLink locale={locale} />
      <header className="flex flex-wrap items-center gap-3">
        <Heading level="h1">
          {formatText(text.reference, { number: order.display_id })}
        </Heading>
        <OrderStatusBadge order={order} locale={locale} />
      </header>
      <LiveOrders
        locale={locale}
        loaded={formatText(text.checked_at, {
          time: formatOrderTime(result.server_time, locale),
        })}
      />
      <Container className="rounded-card px-4 py-4 sm:px-6 sm:py-5">
        <section
          aria-labelledby="order-timeline"
          className="flex flex-col gap-4"
        >
          <Heading id="order-timeline" level="h2">
            {text.timeline}
          </Heading>
          {/* The step staff take now closes the timeline, so Accept and
              Reject, then Start preparing and Ready, always sit in one place
              and keep their outcome and focus across the refresh. */}
          <OrderTimeline
            order={order}
            locale={locale}
            next={
              isAwaiting || hasNextStep || isAwaitingPickup || isOnItsWay ? (
                <div className="flex flex-col gap-y-3">
                  {isAwaiting && (
                    <AcceptanceDeadline
                      order={order}
                      locale={locale}
                      detailed
                    />
                  )}
                  {/* After Ready the next step is the Delivery agent's. */}
                  {isAwaitingPickup && (
                    <Text size="small" weight="plus">
                      {text.next_pickup}
                    </Text>
                  )}
                  {isOnItsWay && (
                    <Text size="small" weight="plus">
                      {text.next_on_its_way}
                    </Text>
                  )}
                  <OrderProgressAction
                    key={order.id}
                    order={order}
                    locale={locale}
                    secondary={
                      <RejectOrder
                        key={`${order.id}-reject`}
                        order={order}
                        locale={locale}
                      />
                    }
                  />
                </div>
              ) : undefined
            }
          />
          {!isAwaiting && (
            <div className="flex flex-col gap-y-1 empty:hidden">
              <AcceptanceDeadline order={order} locale={locale} detailed />
              {ACCEPTED_STATES.has(order.state) && !isDeliveryEnded && (
                <Text size="small" className="text-ui-fg-subtle max-w-prose">
                  {formatText(text.operator_boundary, {
                    number: order.display_id,
                  })}
                </Text>
              )}
            </div>
          )}
        </section>
      </Container>
      {/* The Customer's food rating once delivered, while Feedback is
          released (#249): the absent field hides it. */}
      {order.food_rating !== undefined &&
        order.delivery?.outcome === "delivered" && (
          <Container className="rounded-card flex items-center gap-x-2 px-4 py-4 sm:px-6">
            <Star aria-hidden="true" className="text-ui-fg-subtle shrink-0" />
            <Text weight="plus">
              {order.food_rating === null
                ? RESTAURANT_RATINGS_TEXT[locale].order_not_rated
                : formatText(RESTAURANT_RATINGS_TEXT[locale].order_rating, {
                    rating: order.food_rating,
                  })}
            </Text>
          </Container>
        )}
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
      {order.financial_basis && (
        <Container className="rounded-card overflow-hidden p-0">
          <FinancialBasisDisclosure order={order} locale={locale} />
        </Container>
      )}
    </div>
  )
}
