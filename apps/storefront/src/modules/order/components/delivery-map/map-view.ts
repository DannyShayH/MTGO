import type { OrderProgress } from "@lib/data/orders"
import { shownLocationState } from "../order-progress/location-age.ts"

/**
 * Reported accuracy at or below this many metres draws a dot; anything
 * coarser, or unreported, draws only an area so it never looks precise.
 */
const PRECISE_ACCURACY_M = 50

type DeliveryLocation = NonNullable<OrderProgress["delivery"]>["location"]

export type DeliveryMapView =
  | { kind: "none" }
  | {
      kind: "position"
      latitude: number
      longitude: number
      accuracy_m: number | null
      precision: "precise" | "approximate"
      freshness: "fresh" | "stale"
      revision: number | null
    }

/**
 * What the delivery map may draw: only the Customer's authorized latest
 * measurement, as measured. No marker before pickup, without a coordinate or
 * measurement time, or after a terminal outcome. Freshness is the textual
 * status's own state, so the sixty-second rule never moves the position.
 */
export function deliveryMapView(
  location: DeliveryLocation | null,
  isEnded: boolean,
  age: number | null,
): DeliveryMapView {
  const state = shownLocationState(location, isEnded, age)
  if (
    (state !== "fresh" && state !== "stale") ||
    !location ||
    age === null ||
    location.latitude === null ||
    location.longitude === null
  )
    return { kind: "none" }
  return {
    kind: "position",
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy_m: location.accuracy_m,
    precision:
      location.accuracy_m !== null && location.accuracy_m <= PRECISE_ACCURACY_M
        ? "precise"
        : "approximate",
    freshness: state,
    revision: location.revision,
  }
}
