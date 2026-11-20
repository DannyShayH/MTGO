import { Directions } from "@medusajs/icons"
import type { Locale } from "@dtc/i18n"
import type { DeliveryCopy } from "./copy"
import { formatDistance } from "./pickup-distance"

/**
 * The trip length from pickup to the Customer (#191), drawn on the route
 * line between the two stops. The label is for screen readers; the icon
 * says it on screen. A missing distance keeps the pill's place and says so
 * quietly, so cards stay the same height, and never blocks the card's
 * actions.
 */
export function TripLeg({
  tripDistanceKm,
  copy,
  locale,
}: {
  tripDistanceKm: number | null
  copy: DeliveryCopy
  locale: Locale
}) {
  const distance = formatDistance(tripDistanceKm, locale)
  return (
    <p className="bg-ui-bg-subtle text-mtogo-text-secondary inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-sm">
      <Directions aria-hidden className="shrink-0" />
      <span className="sr-only">{copy.tripDistance} </span>
      {distance ? (
        <span className="text-mtogo-text-primary font-semibold tabular-nums">
          {distance}
        </span>
      ) : (
        <span>{copy.distanceUnavailable}</span>
      )}
    </p>
  )
}
