import { relayOrderFeed } from "@lib/data/order-feed"

export const dynamic = "force-dynamic"

/** The same-origin kitchen feed relay (#148); see `relayOrderFeed`. */
export async function GET(request: Request) {
  return relayOrderFeed(request.signal)
}
