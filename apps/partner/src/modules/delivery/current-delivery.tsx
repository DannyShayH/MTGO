import { CheckCircleSolid, Phone } from "@medusajs/icons"
import { Button } from "@medusajs/ui"
import type { Locale } from "@dtc/i18n"
import type { CurrentDelivery } from "@lib/data/delivery-agent"
import { ConfirmPickup } from "./confirm-pickup"
import { CARD, PRESSABLE, type DeliveryCopy } from "./copy"
import { PreparationBadge } from "./preparation-badge"
import { streetLine } from "./route-links"
import { RouteLinksPanel } from "./route-links-panel"
import { RouteStops } from "./route-stops"

/**
 * The responsible agent's one current delivery (#157), the first thing on
 * the screen. Only here does the workspace show the Customer's name, address
 * and phone. Before collection the primary action is confirming pickup,
 * offered only once the server allows it (food ready); afterwards the card
 * shows the recorded pickup time and the next step (#160). There is no
 * release control.
 */
export function CurrentDeliveryCard({
  delivery,
  copy,
  locale,
  pickupRetryIdentity,
  formatTime,
}: {
  delivery: CurrentDelivery
  copy: DeliveryCopy
  locale: Locale
  /** A fresh retry identity for this render's pickup confirmation. */
  pickupRetryIdentity: string
  formatTime: (value: string) => string
}) {
  const { customer } = delivery
  const canPickUp = delivery.allowed_actions.includes("confirm_pickup")
  return (
    <article
      aria-labelledby="current-delivery-title"
      className={`${CARD} ring-mtogo-action-primary overflow-hidden ring-2`}
    >
      <p className="bg-mtogo-surface-selected text-mtogo-text-link flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm font-medium">
        <span>{copy.responsible}</span>
        {delivery.assignment_source === "operator_assignment" && (
          <span>{copy.assignedByOperator}</span>
        )}
      </p>
      <div className="flex flex-col gap-5 p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="current-delivery-title"
              className="text-mtogo-text-primary break-words text-lg font-semibold leading-tight tracking-tight"
            >
              {delivery.restaurant_name}
            </h3>
            <p className="text-mtogo-text-secondary text-sm tabular-nums">
              #{delivery.order_reference}
            </p>
          </div>
          <PreparationBadge status={delivery.preparation_status} copy={copy} />
        </header>
        <RouteStops
          pickupLabel={copy.pickupAt}
          pickup={delivery.pickup_address}
          dropoffLabel={copy.deliverTo}
          dropoff={
            <>
              <span className="block font-medium">{customer.name}</span>
              <span className="block">{streetLine(customer)}</span>
              <span className="block">
                {customer.postal_code} {customer.city}
              </span>
            </>
          }
        />
        <RouteLinksPanel delivery={delivery} copy={copy} />
        {delivery.picked_up_at ? (
          <div
            role="status"
            className="bg-mtogo-status-success-surface text-mtogo-status-success-text flex items-start gap-2 rounded-lg p-3 text-base"
          >
            <CheckCircleSolid aria-hidden className="mt-0.5 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium tabular-nums">
                {copy.pickedUpAt} {formatTime(delivery.picked_up_at)}
              </span>
              <span>{copy.nextDeliver}</span>
            </span>
          </div>
        ) : canPickUp ? (
          <ConfirmPickup
            orderId={delivery.order_id}
            restaurantName={delivery.restaurant_name}
            retryIdentity={pickupRetryIdentity}
            locale={locale}
            copy={copy}
          />
        ) : (
          <p className="text-mtogo-text-secondary bg-ui-bg-subtle rounded-lg p-3 text-sm">
            {copy.pickupWaiting}
          </p>
        )}
        {customer.phone ? (
          <Button
            asChild
            size="large"
            variant={canPickUp ? "secondary" : "primary"}
            className={`focus-visible:ring-mtogo-focus-ring h-auto min-h-12 w-full flex-wrap gap-x-2 gap-y-0.5 whitespace-normal py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
          >
            {/* Wraps at large text sizes: the number moves under the label instead of overflowing. */}
            <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>
              <Phone aria-hidden />
              <span>{copy.call}</span>
              <span className="whitespace-nowrap tabular-nums opacity-80">
                {customer.phone}
              </span>
            </a>
          </Button>
        ) : (
          <p className="text-mtogo-text-secondary text-sm">{copy.noPhone}</p>
        )}
        <p className="text-mtogo-text-secondary text-sm">
          {copy.assignedAt} {formatTime(delivery.assigned_at)}
        </p>
      </div>
    </article>
  )
}
