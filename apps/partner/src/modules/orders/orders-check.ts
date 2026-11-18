import type { OrdersCheck } from "@lib/data/order-feed-relay"

/**
 * Asks the same-origin `/api/orders/check` whether the authorized Orders
 * read works right now (#148). A network failure or an unreadable answer
 * counts as unavailable.
 */
export async function fetchOrdersCheck(): Promise<OrdersCheck> {
  try {
    const response = await fetch("/api/orders/check", { cache: "no-store" })
    return (await response.json()) as OrdersCheck
  } catch {
    return { status: "unavailable" }
  }
}
