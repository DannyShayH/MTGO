import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"

export type CurrentStaff = {
  staff: {
    id: string
    name: string
    email: string
    status: "authorized"
    restaurant_id: string
  }
  restaurant: { id: string; name: string }
}

/** Why a signed-in staff member was signed out; each has a text in @dtc/i18n. */
export const SESSION_ENDED_CODES = [
  "staff_access_revoked",
  "session_expired",
] as const
export type SessionEndedCode = (typeof SESSION_ENDED_CODES)[number]

export type StaffSession =
  | { status: "authorized"; current: CurrentStaff }
  | { status: "signed_out" }
  | { status: "ended"; code: SessionEndedCode }

/**
 * Asks the backend who the token belongs to. The backend checks on every
 * request that the staff member is still authorized (ADR-0017), so a revoked
 * staff member is told on their next page load, not when the token expires.
 */
export async function retrieveStaffSession(
  token: string | undefined,
): Promise<StaffSession> {
  if (!token) return { status: "signed_out" }
  try {
    const current = await sdk.client.fetch<CurrentStaff>("/partner/me", {
      headers: { authorization: `Bearer ${token}` },
    })
    return { status: "authorized", current }
  } catch (error) {
    // Branch on the status only (coding standard 7.2): 403 is the one refusal
    // /partner/me has for a valid token, staff_access_revoked.
    if (error instanceof FetchError && error.status === 403)
      return { status: "ended", code: "staff_access_revoked" }
    if (error instanceof FetchError && error.status === 401)
      return { status: "ended", code: "session_expired" }
    throw error
  }
}

/** The signed-in staff member of this request, fetched once per render. */
export const getStaffSession = cache(async () =>
  retrieveStaffSession((await cookies()).get(PARTNER_TOKEN_COOKIE)?.value),
)

/**
 * The signed-in staff member, or a redirect: to sign-in when there is no
 * session, and through /session-ended (which clears the cookie) when it ended.
 */
export async function requireCurrentStaff(): Promise<CurrentStaff> {
  const session = await getStaffSession()
  if (session.status === "signed_out") redirect("/sign-in")
  if (session.status === "ended")
    redirect(`/session-ended?code=${session.code}`)
  return session.current
}
