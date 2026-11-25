import { relayOrderTrackingFeed } from "@lib/data/tracking-feed"

export const dynamic = "force-dynamic"

/** The same-origin Customer tracking feed relay (#215); see `relayTrackingFeed`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return relayOrderTrackingFeed(id, request.signal)
}
