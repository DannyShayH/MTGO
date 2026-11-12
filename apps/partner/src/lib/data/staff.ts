import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { BACKEND_URL, PARTNER_TOKEN_COOKIE } from "@lib/config"

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
  | { status: "ended"; code: SessionEndedCode; restaurant_name?: string }

/**
 * Asks the backend who the token belongs to. The backend checks on every
 * request that the staff member is still authorized (ADR-0017), so a revoked
 * staff member is told on their next page load, not when the token expires.
 *
 * This one call uses fetch instead of the js-sdk: the SDK's FetchError keeps
 * only the message, and the refusal for revoked staff names the Restaurant
 * whose access ended, which the access-ended message shows (spec story 43).
 */
export async function retrieveStaffSession(
  token: string | undefined,
): Promise<StaffSession> {
  if (!token) return { status: "signed_out" }
  const response = await fetch(new URL("/partner/me", BACKEND_URL), {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  })
  if (response.ok)
    return { status: "authorized", current: await response.json() }
  const code = sessionEndedCodeForStatus(response.status)
  if (!code)
    throw new FetchError(
      response.statusText,
      response.statusText,
      response.status,
    )
  if (code !== "staff_access_revoked") return { status: "ended", code }
  return {
    status: "ended",
    code,
    restaurant_name: await refusedRestaurantName(response),
  }
}

/** The name in the backend's staff_access_revoked refusal, when it has one. */
async function refusedRestaurantName(response: Response) {
  const body: unknown = await response.json().catch(() => undefined)
  const name = (body as { restaurant?: { name?: unknown } } | undefined)
    ?.restaurant?.name
  return typeof name === "string" && name.trim() ? name : undefined
}

/**
 * Branch on the status only (coding standard 7.2): 403 is the one refusal
 * partner routes have for a valid token, staff_access_revoked, and 401 means
 * the token stopped working.
 */
function sessionEndedCodeForStatus(
  status: number | undefined,
): SessionEndedCode | undefined {
  if (status === 403) return "staff_access_revoked"
  if (status === 401) return "session_expired"
  return undefined
}

/** Why a partner request through the js-sdk ended the session, if it did. */
export function sessionEndedCode(error: unknown): SessionEndedCode | undefined {
  return error instanceof FetchError
    ? sessionEndedCodeForStatus(error.status)
    : undefined
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
