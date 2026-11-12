import "server-only"
import { cookies } from "next/headers"
import { PARTNER_TOKEN_COOKIE } from "./config"

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
})

/** Keeps the staff token in the partner app's own httpOnly cookie (ADR-0017). */
export async function storePartnerToken(token: string) {
  // Medusa's tokens expire after a day by default.
  ;(await cookies()).set(
    PARTNER_TOKEN_COOKIE,
    token,
    cookieOptions(60 * 60 * 24),
  )
}
