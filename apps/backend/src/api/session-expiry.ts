import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * When the bearer token `authenticate` has already verified stops being
 * valid, in milliseconds, or `undefined` when it carries no `exp`. Medusa
 * checks the token only when a request starts, so a long-lived response such
 * as the kitchen feed (#148) must end by itself at this time.
 */
export function bearerExpiresAt(
  authorization: string | undefined,
): number | undefined {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? ""
  try {
    const { exp } = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    )
    return typeof exp === "number" ? exp * 1000 : undefined
  } catch {
    return undefined
  }
}

/**
 * Runs after `authenticate` on long-lived routes and keeps the verified
 * token's expiry for the route handler (`sessionExpiresAt`).
 */
export function recordSessionExpiry(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  res.locals.session_expires_at = bearerExpiresAt(req.headers.authorization)
  next()
}

/** The expiry `recordSessionExpiry` kept for this request. */
export const sessionExpiresAt = (res: MedusaResponse): number | undefined =>
  res.locals.session_expires_at
