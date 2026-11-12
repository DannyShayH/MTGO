import { NextRequest, NextResponse } from "next/server"
import { PARTNER_TOKEN_COOKIE } from "@lib/config"
import { SESSION_ENDED_CODES, type SessionEndedCode } from "@lib/data/staff"

/**
 * Pages cannot change cookies while rendering, so a page that finds the
 * session has ended sends the browser here to clear it (spec: on
 * staff_access_revoked or an expired token, clear the cookie and show sign-in).
 */
export function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const target = new URL("/sign-in", request.nextUrl)
  if (SESSION_ENDED_CODES.includes(code as SessionEndedCode))
    target.searchParams.set("message", code as SessionEndedCode)
  const response = NextResponse.redirect(target)
  response.cookies.delete(PARTNER_TOKEN_COOKIE)
  return response
}
