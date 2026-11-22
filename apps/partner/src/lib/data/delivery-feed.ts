import "server-only"
import { cookies } from "next/headers"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { log } from "@lib/logger"
import { relayFeed } from "./order-feed-relay"
import { checkDeliveryWith, type DeliveryCheck } from "./delivery-feed-relay"

export type { DeliveryCheck }

const FEED_ROUTE = "/partner/deliveries/stream"
const CHECK_ROUTE = "/partner/delivery-agent/current"

const authorization = (token: string) => ({ authorization: `Bearer ${token}` })
const tokenOfRequest = async () =>
  (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value

/**
 * Relays the backend agent feed to the phone on the same origin (#165). The
 * bearer comes from this request's httpOnly cookie and is passed per call,
 * never to the browser, a URL or a shared client. Closing the phone's
 * connection aborts the backend stream.
 */
export async function relayDeliveryFeed(
  signal: AbortSignal,
): Promise<Response> {
  return relayFeed({
    token: await tokenOfRequest(),
    openUpstream: (token) =>
      sdk.client.fetchStream(FEED_ROUTE, { headers: authorization(token) }),
    signal,
    onFailure: () =>
      log("upstream.request.failed", { route: FEED_ROUTE, method: "GET" }),
  })
}

/** The bounded polling fallback's check (#165). See `checkDeliveryWith`. */
export async function checkDelivery(): Promise<DeliveryCheck> {
  return checkDeliveryWith({
    token: await tokenOfRequest(),
    readCurrent: (token) =>
      sdk.client.fetch(CHECK_ROUTE, {
        headers: authorization(token),
        cache: "no-store",
      }),
    onFailure: (error) =>
      log("upstream.request.failed", {
        route: CHECK_ROUTE,
        method: "GET",
        status: error instanceof FetchError ? error.status : undefined,
      }),
  })
}
