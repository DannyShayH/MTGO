import type { CurrentDelivery } from "@lib/data/delivery-agent"

type RouteDelivery = Pick<CurrentDelivery, "pickup_address"> & {
  customer: Pick<
    CurrentDelivery["customer"],
    "address_1" | "address_2" | "postal_code" | "city"
  >
}

/** The Customer's street and optional second line as one line, as the card shows it. */
export const streetLine = (customer: RouteDelivery["customer"]) =>
  [customer.address_1, customer.address_2].filter(Boolean).join(", ")

const googleDirectionsUrl = (stops: { origin?: string; destination: string }) =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    ...stops,
    travelmode: "bicycling",
  })}`

const appleMapsUrl = (stops: { saddr?: string; daddr: string }) =>
  `https://maps.apple.com/?${new URLSearchParams(stops)}`

/** Every MTOGO address is Danish; naming the country keeps maps from guessing a same-named street abroad. */
const inDenmark = (address: string) => `${address}, Denmark`

/**
 * The two maps routes of a current delivery (#190), each as a Google Maps
 * directions link and an Apple Maps link. The pickup route has no origin, so
 * the maps app starts from the phone's own position and MTOGO never learns it.
 */
export function routeLinks(delivery: RouteDelivery) {
  const { customer } = delivery
  const pickup = inDenmark(delivery.pickup_address)
  const dropoff = inDenmark(
    `${streetLine(customer)}, ${customer.postal_code} ${customer.city}`,
  )
  return {
    pickup: {
      google: googleDirectionsUrl({ destination: pickup }),
      apple: appleMapsUrl({ daddr: pickup }),
    },
    customer: {
      google: googleDirectionsUrl({ origin: pickup, destination: dropoff }),
      apple: appleMapsUrl({ saddr: pickup, daddr: dropoff }),
    },
  }
}
