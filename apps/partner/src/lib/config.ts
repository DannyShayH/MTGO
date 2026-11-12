import "server-only"
import Medusa from "@medusajs/js-sdk"

export const PARTNER_TOKEN_COOKIE = "mtogo_partner_token"
export const LOCALE_COOKIE = "mtogo_partner_locale"
/** The Restaurant whose access ended, carried from /session-ended to sign-in. */
export const ACCESS_ENDED_COOKIE = "mtogo_partner_access_ended"
export const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

/**
 * One client for all requests is safe because it stores no token: every call
 * passes the signed-in staff member's token itself (ADR-0017).
 */
export const sdk = new Medusa({
  baseUrl: BACKEND_URL,
  debug: false,
  auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
})
