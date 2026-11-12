import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { sessionEndedCode } from "./staff"

export type PartnerRestaurant = {
  id: string
  name: string
  address_street: string
  address_postal_code: string
  address_city: string
  contact_phone: string
  contact_email: string
  delivery_area: { postal_code: string; name: string | null }[]
  is_active: boolean
  is_open: boolean
  receiving_new_orders: boolean
  reason: string | null
}

/**
 * The signed-in staff member's own Restaurant. The backend checks again that
 * the staff member is authorized, so a revocation or an expired token between
 * the layout and this call still ends the session.
 */
export async function retrieveOwnRestaurant(
  id: string,
): Promise<PartnerRestaurant> {
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  try {
    const { restaurant } = await sdk.client.fetch<{
      restaurant: PartnerRestaurant
    }>(`/partner/restaurants/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    return restaurant
  } catch (error) {
    const code = sessionEndedCode(error)
    if (code) redirect(`/session-ended?code=${code}`)
    throw error
  }
}
