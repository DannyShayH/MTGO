import "server-only"
import { cookies } from "next/headers"
import { sdk } from "@lib/config"
import { log } from "@lib/logger"
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
  return relayTrackingFeed({
    token,
    openUpstream: (bearer) =>
      sdk.client.fetchStream(
        `/store/orders/${encodeURIComponent(orderId)}/tracking/stream`,
        { headers: { authorization: `Bearer ${bearer}` }, cache: "no-store" },
      ),
    signal,
    onFailure: (error) =>
      log("upstream.request.failed", {
        route: "/store/orders/:id/tracking/stream",
        method: "GET",
        status: statusOfStreamFailure(error),
      }),
  })
}
