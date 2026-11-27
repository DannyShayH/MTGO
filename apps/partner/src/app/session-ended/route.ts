import { requestId, httpStatus } from "@dtc/logging"
import { log } from "@lib/logger"
import { NextRequest, NextResponse } from "next/server"
import { ACCESS_ENDED_COOKIE, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { getDeliveryAgent } from "@lib/data/delivery-agent"
import { retrieveStaffSession, type StaffSession } from "@lib/data/staff"
import {
  cookieHolderOf,
  homeOfCookieHolder,
  sessionEndedSignInPath,
  type CookieHolder,
} from "@lib/session-ended"
import { cookieOptions } from "@lib/partner-token"

/**
 * Pages cannot change cookies while rendering, so a page that finds the
 * session has ended sends the browser here to clear it (spec: on
 * staff_access_revoked or an expired token, clear the cookie and show sign-in).
 * The Restaurant's name for the access-ended message is asked from the
 * backend with the token itself, never taken from the link, so a crafted link
 * cannot put another name in MTOGO's message.
 *
 * Restaurant staff and Delivery agents share the cookie. When it now signs in
 * the other role (an agent signed in while a kitchen tab was open), that
 * session is kept and the browser goes to its home (#253).
 */
export async function GET(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"))
  log("auth.session.ended", {
    request_id: id,
    route: "/session-ended",
    method: "GET",
  })
  const code = request.nextUrl.searchParams.get("code")
  const token = request.cookies.get(PARTNER_TOKEN_COOKIE)?.value
  const session = await readStaffSession(token, id)
  const home = homeOfCookieHolder(
    await identifyCookieHolder(token, session, id),
  )
  if (home) return redirectTo(home)

  const response = redirectTo(sessionEndedSignInPath(code))
  response.cookies.delete(PARTNER_TOKEN_COOKIE)
  response.cookies.delete(ACCESS_ENDED_COOKIE)
  if (code === "staff_access_revoked") {
    const name =
      session?.status === "ended" ? session.restaurant_name : undefined
    if (name) response.cookies.set(ACCESS_ENDED_COOKIE, name, cookieOptions(60))
  }
  return response
}

/**
 * A redirect to a path on the host the browser used. `NextResponse.redirect`
 * needs an absolute URL, and behind the proxy the request's own URL names
 * the container's address (`localhost:8100`).
 */
const redirectTo = (path: string) =>
  new NextResponse(null, { status: 307, headers: { location: path } })

async function identifyCookieHolder(
  token: string | undefined,
  session: StaffSession | undefined,
  id: string,
): Promise<CookieHolder> {
  if (!token) return "nobody"
  const staffAuthorized = session?.status === "authorized"
  if (staffAuthorized) return cookieHolderOf({ staffAuthorized, agent: null })
  try {
    return cookieHolderOf({
      staffAuthorized,
      agent: await getDeliveryAgent(token),
    })
  } catch (error) {
    logUpstreamFailure(error, "/partner/delivery-agent/me", id)
    return "nobody"
  }
}

async function readStaffSession(token: string | undefined, id: string) {
  try {
    return await retrieveStaffSession(token, id)
  } catch (error) {
    // The message falls back to "the Restaurant"; signing out must not fail.
    logUpstreamFailure(error, "/partner/me", id)
    return undefined
  }
}

/** Logs only the status, never the token or the response (coding standard 7.2). */
function logUpstreamFailure(error: unknown, route: string, id: string) {
  log("upstream.request.failed", {
    request_id: id,
    route,
    method: "GET",
    status: httpStatus(error),
  })
}
