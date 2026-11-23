import type { HttpTypes } from "@medusajs/types"
import type { AuthHeaders } from "./cookies"

/** The part of the Medusa SDK's `client.fetch` this read uses. */
export type CustomerFetch = <T>(
  path: string,
  init: {
    method: "GET"
    headers: Record<string, string>
    query?: Record<string, string>
    cache?: RequestCache
  },
) => Promise<T>

/**
 * The signed-in Customer, or `null` for a visitor, an expired session or an
 * email that is not verified yet. The Customer is read without Orders: the
 * pages that list Orders load them on their own (#205).
 */
export async function readVerifiedCustomer(
  fetch: CustomerFetch,
  authHeaders: AuthHeaders,
): Promise<HttpTypes.StoreCustomer | null> {
  if (!("authorization" in authHeaders)) return null

  const customer = await fetch<{ customer: HttpTypes.StoreCustomer }>(
    "/store/customers/me",
    { method: "GET", headers: authHeaders, cache: "no-store" },
  )
    .then(({ customer }) => customer)
    .catch(() => null)
  if (!customer) return null

  const isVerified = await fetch<{ verified: true }>(
    "/store/customers/me/verification",
    { method: "GET", headers: authHeaders, cache: "no-store" },
  )
    .then(() => true)
    .catch(() => false)

  return isVerified ? customer : null
}
