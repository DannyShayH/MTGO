import Link from "next/link"
import { formatText, type Locale } from "@dtc/i18n"
import type { AvailableDelivery } from "@lib/data/delivery-agent"
import { ClaimDelivery } from "./claim-delivery"
import { CARD, type DeliveryCopy } from "./copy"
import { TripLeg } from "./distance-facts"
import { PickupDistance } from "./location-sharing"
import { PreparationBadge } from "./preparation-badge"
import { RouteStops } from "./route-stops"

/** Under this many minutes the time left is shown as a warning. */
const SOON_MINUTES = 5

/**
 * One available delivery: who and where, how long it can still be claimed
 * and, when the agent has no current delivery, the claim. Before claiming
 * only the destination postal code and its town are shown.
 */
export function AvailableCard({
  delivery,
  town,
  serverTime,
  copy,
  locale,
  formatTime,
  retryIdentity,
  showDetails = true,
}: {
  delivery: AvailableDelivery
  town: string | null
  serverTime: string
  copy: DeliveryCopy
  locale: Locale
  formatTime: (value: string) => string
  /** Set only when the agent may claim (no current delivery). */
  retryIdentity?: string
  /** False on the detail page itself. */
  showDetails?: boolean
}) {
  const minutes = Math.floor(
    (new Date(delivery.claim_deadline).getTime() -
      new Date(serverTime).getTime()) /
      60000,
  )
  const left =
    minutes < 1 ? copy.underMinute : formatText(copy.timeLeft, { minutes })
  return (
    <article className={`${CARD} flex flex-col gap-4 p-4`}>
      {/* The badge wraps below a long name or at high zoom, never squeezing it mid-word. */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-[9rem] flex-1">
          <h3 className="text-mtogo-text-primary break-words text-base font-semibold leading-snug">
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
        pickupAside={
          <PickupDistance
            orderId={delivery.order_id}
            copy={copy}
            locale={locale}
          />
        }
        leg={
          <TripLeg
            tripDistanceKm={delivery.trip_distance_km}
            copy={copy}
            locale={locale}
          />
        }
        dropoffLabel={copy.destination}
        dropoff={
          <>
            <span className="tabular-nums">
              {delivery.destination_postal_code}
            </span>
            {town ? ` ${town}` : ""}
          </>
        }
      />
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-mtogo-text-primary font-medium tabular-nums">
            {copy.claimBy} {formatTime(delivery.claim_deadline)}
          </span>
          <span
            className={
              minutes < SOON_MINUTES
                ? "text-mtogo-status-warning-text bg-mtogo-status-warning-surface rounded px-1.5"
                : "text-mtogo-text-secondary"
            }
          >
            {left}
          </span>
        </p>
        <p className="text-mtogo-text-secondary tabular-nums">
          {copy.acceptedAt} {formatTime(delivery.accepted_at)}
        </p>
      </div>
      {retryIdentity && (
        <ClaimDelivery
          orderId={delivery.order_id}
          retryIdentity={retryIdentity}
          locale={locale}
          copy={copy}
        />
      )}
      {showDetails && (
        <Link
          href={`/delivery/${encodeURIComponent(delivery.order_id)}`}
          className="text-mtogo-text-link focus-visible:ring-mtogo-focus-ring -my-1 inline-flex min-h-11 items-center self-start rounded text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2"
        >
          {copy.details}
        </Link>
      )}
    </article>
  )
}
