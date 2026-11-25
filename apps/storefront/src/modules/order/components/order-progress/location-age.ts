import type { OrderProgress } from "@lib/data/orders"

type DeliveryLocation = NonNullable<OrderProgress["delivery"]>["location"]

/** The location state the Customer sees: the textual status and the map. */
export type ShownLocationState = DeliveryLocation["state"]

/** Estimate age using the server's clock and elapsed monotonic time. */
export function locationAge(
  serverTime: string,
  observedAt: string,
  elapsed: number,
) {
  return Math.max(
    0,
    Date.parse(serverTime) - Date.parse(observedAt) + Math.max(0, elapsed),
  )
}

export function locationIsStale(age: number) {
  return age >= 60_000
}

/**
 * The one rule for what location state the Customer sees, shared by the
 * textual status and the delivery map so they cannot disagree. A terminal
 * outcome ends sharing whatever the projection still holds, and a fresh
 * measurement turns stale locally at sixty seconds without waiting for a read.
 */
export function shownLocationState(
  location: DeliveryLocation | null,
  isEnded: boolean,
  age: number | null,
): ShownLocationState {
  if (isEnded) return "ended"
  if (!location) return "not_started"
  if (location.state === "fresh" && age !== null && locationIsStale(age))
    return "stale"
  return location.state
}
