import { Phone } from "@medusajs/icons"
import { Button } from "@medusajs/ui"
import type { CurrentDelivery } from "@lib/data/delivery-agent"
import { CARD, PRESSABLE, type DeliveryCopy } from "./copy"
import { PreparationBadge } from "./preparation-badge"
import { RouteStops } from "./route-stops"

/**
 * The responsible agent's one current delivery (#157), the first thing on
 * the screen. Only here does the workspace show the Customer's name, address
 * and phone. Calling is the one large action; there is no release or
 * hand-over control.
 */
export function CurrentDeliveryCard({
  delivery,
  copy,
  formatTime,
}: {
  delivery: CurrentDelivery
  copy: DeliveryCopy
  formatTime: (value: string) => string
}) {
  const { customer } = delivery
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
              <span className="block">
                {customer.address_1}
                {customer.address_2 ? `, ${customer.address_2}` : ""}
              </span>
              <span className="block">
                {customer.postal_code} {customer.city}
              </span>
            </>
          }
        />
        {customer.phone ? (
          <Button
            asChild
            size="large"
            className={`focus-visible:ring-mtogo-focus-ring min-h-12 w-full gap-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
          >
            <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>
              <Phone aria-hidden />
              <span>{copy.call}</span>
              <span className="tabular-nums opacity-80">{customer.phone}</span>
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
