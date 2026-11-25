import "server-only"
import { cookies } from "next/headers"
import { sdk } from "@lib/config"
import { logUpstreamFailure } from "@lib/logger"
import { getRequestId } from "./request-id"
import { relayTrackingFeed, statusOfStreamFailure } from "./tracking-feed-relay"

/**
 * Relays the owning Customer's tracking feed to the browser on the same
 * origin (#215). The bearer comes from this request's httpOnly session
 * cookie and is passed per call, never to the browser, a query string or a
 * shared client. See `relayTrackingFeed`.
 */
export async function relayOrderTrackingFeed(
  orderId: string,
  signal: AbortSignal,
): Promise<Response> {
  const token = (await cookies()).get("_medusa_jwt")?.value
  // A stream does not pass through the SDK's fetch, which adds the ID.
  const requestId = await getRequestId()
  return relayTrackingFeed({
    token,
    openUpstream: (bearer) =>
      sdk.client.fetchStream(
        `/store/orders/${encodeURIComponent(orderId)}/tracking/stream`,
        {
          headers: {
            authorization: `Bearer ${bearer}`,
            ...(requestId && { "x-request-id": requestId }),
          },
          cache: "no-store",
        },
      ),
    signal,
    onFailure: (error) =>
      logUpstreamFailure({
        route: "/store/orders/:id/tracking/stream",
        method: "GET",
        status: statusOfStreamFailure(error),
      }),
  })
}
