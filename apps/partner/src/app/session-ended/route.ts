import { requestId, httpStatus } from "@dtc/logging"
import { log } from "@lib/logger"
import { NextRequest, NextResponse } from "next/server"
import { ACCESS_ENDED_COOKIE, PARTNER_TOKEN_COOKIE } from "@lib/config"
import {
  retrieveStaffSession,
  SESSION_ENDED_CODES,
  type SessionEndedCode,
} from "@lib/data/staff"
import { cookieOptions } from "@lib/partner-token"

/**
 * Pages cannot change cookies while rendering, so a page that finds the
 * session has ended sends the browser here to clear it (spec: on
 * staff_access_revoked or an expired token, clear the cookie and show sign-in).
 * The Restaurant's name for the access-ended message is asked from the
 * backend with the token itself, never taken from the link, so a crafted link
 * cannot put another name in MTOGO's message.
 */
export async function GET(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"))
  log("auth.session.ended", {
    request_id: id,
    route: "/session-ended",
    method: "GET",
  })
  const code = request.nextUrl.searchParams.get("code")
  const target = new URL("/sign-in", request.nextUrl)
  if (SESSION_ENDED_CODES.includes(code as SessionEndedCode))
    target.searchParams.set("message", code as SessionEndedCode)
  const response = NextResponse.redirect(target)
  response.cookies.delete(PARTNER_TOKEN_COOKIE)
  response.cookies.delete(ACCESS_ENDED_COOKIE)
  if (code === "staff_access_revoked") {
    const name = await endedRestaurantName(
      request.cookies.get(PARTNER_TOKEN_COOKIE)?.value,
      id,
    )
    if (name) response.cookies.set(ACCESS_ENDED_COOKIE, name, cookieOptions(60))
  }
  return response
}

async function endedRestaurantName(token: string | undefined, id: string) {
  try {
    const session = await retrieveStaffSession(token, id)
    return session.status === "ended" ? session.restaurant_name : undefined
  } catch (error) {
    // The message falls back to "the Restaurant"; signing out must not fail.
    // Log only the status, never the token or the response (coding standard 7.2).
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/me",
      method: "GET",
      status: httpStatus(error),
    })
    return undefined
  }
}
