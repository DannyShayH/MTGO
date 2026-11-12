import "server-only"
import Medusa from "@medusajs/js-sdk"

export const PARTNER_TOKEN_COOKIE = "mtogo_partner_token"
export const LOCALE_COOKIE = "mtogo_partner_locale"

/**
 * One client for all requests is safe because it stores no token: every call
 * passes the signed-in staff member's token itself (ADR-0017).
 */
export const sdk = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  debug: false,
  auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
})
