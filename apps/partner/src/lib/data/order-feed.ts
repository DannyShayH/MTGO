import "server-only"
import { cookies } from "next/headers"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { log } from "@lib/logger"
import {
  checkOrdersWith,
  relayFeed,
  type AwaitingRead,
  type OrdersCheck,
} from "./order-feed-relay"

export type { OrdersCheck }

const FEED_ROUTE = "/partner/orders/stream"
/**
 * The backend's largest page, earliest deadline first. A kitchen with more
 * awaiting Orders than this still gets every alert for Orders on the page.
 */
const CHECK_ROUTE = "/partner/orders?view=awaiting&limit=50&offset=0"

const authorization = (token: string) => ({ authorization: `Bearer ${token}` })
const tokenOfRequest = async () =>
  (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value

/**
 * Relays the backend kitchen feed to the browser on the same origin (#148).
 * The bearer comes from this request's httpOnly cookie and is passed per
 * call, never to the browser or a shared client. See `relayFeed`.
 */
export async function relayOrderFeed(signal: AbortSignal): Promise<Response> {
  return relayFeed({
    token: await tokenOfRequest(),
    openUpstream: (token) =>
      sdk.client.fetchStream(FEED_ROUTE, { headers: authorization(token) }),
    signal,
    onFailure: () =>
      log("upstream.request.failed", { route: FEED_ROUTE, method: "GET" }),
  })
}

/** The bounded polling fallback's check (#148). See `checkOrdersWith`. */
export async function checkOrders(): Promise<OrdersCheck> {
  return checkOrdersWith({
    token: await tokenOfRequest(),
    readQueue: (token) =>
      sdk.client.fetch<AwaitingRead>(CHECK_ROUTE, {
        headers: authorization(token),
        cache: "no-store",
      }),
    onFailure: (error) =>
      log("upstream.request.failed", {
        route: "/partner/orders",
        method: "GET",
        status: error instanceof FetchError ? error.status : undefined,
      }),
  })
}
