"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { FetchError } from "@medusajs/js-sdk"
import { isLocale, type MessageCode } from "@dtc/i18n"
import { LOCALE_COOKIE, PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { cookieOptions, storePartnerToken } from "@lib/partner-token"
import { retrieveStaffSession, type StaffSession } from "./staff"

export type SignInState = { error?: MessageCode }
/**
 * Signs in on the server and keeps the token in the partner app's own
 * httpOnly cookie. Medusa's session cookie belongs to the backend origin and
 * would be shared with a Customer's storefront session, so it is never used
 * (ADR-0017).
 */
export async function signIn(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!email || !password) return { error: "sign_in_failed" }
  let token: string
  let session: StaffSession
  try {
    const result = await sdk.auth.login("restaurant_staff", "emailpass", {
      email,
      password,
    })
    if (typeof result !== "string") return { error: "unknown_error" }
    token = result
    session = await retrieveStaffSession(token)
  } catch (error) {
    if (error instanceof FetchError && error.status === 401)
      return { error: "sign_in_failed" }
    // SDK error messages may contain backend details. Log only the status,
    // never credentials, tokens, request bodies or full error responses.
    console.error("Partner sign-in request failed", {
      status: error instanceof FetchError ? error.status : undefined,
    })
    return { error: "unknown_error" }
  }
  if (session.status === "ended")
    // A login that never became staff gets the same message as a wrong
    // password, so the form does not reveal which emails have a login.
    return {
      error:
        session.code === "staff_access_revoked"
          ? "staff_access_revoked"
          : "sign_in_failed",
    }
  await storePartnerToken(token)
  redirect("/overview")
}

export async function signOut() {
  ;(await cookies()).delete(PARTNER_TOKEN_COOKIE)
  redirect("/sign-in?message=signed_out")
}

/** Remembers the Dansk/English choice for a year (spec story 45). */
export async function chooseLanguage(form: FormData) {
  const locale = form.get("locale")
  if (!isLocale(locale)) return
  ;(await cookies()).set(
    LOCALE_COOKIE,
    locale,
    cookieOptions(60 * 60 * 24 * 365),
  )
  revalidatePath("/", "layout")
}
