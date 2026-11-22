import { relayDeliveryFeed } from "@lib/data/delivery-feed"

export const dynamic = "force-dynamic"

/** The same-origin Delivery agent feed relay (#165); see `relayDeliveryFeed`. */
export async function GET(request: Request) {
  return relayDeliveryFeed(request.signal)
}
