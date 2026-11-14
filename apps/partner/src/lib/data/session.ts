"use server"

import { requestId, httpStatus } from "@dtc/logging"
import { log } from "@lib/logger"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { FetchError } from "@medusajs/js-sdk"
import { isLocale, type MessageCode } from "@dtc/i18n"
import {
  LOCALE_COOKIE,
  PARTNER_TOKEN_COOKIE,
  createPartnerSdk,
} from "@lib/config"
import { cookieOptions, storePartnerToken } from "@lib/partner-token"
import { retrieveStaffSession, type StaffSession } from "./staff"

export type SignInState = { error?: MessageCode; restaurant_name?: string }
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
  const id = requestId((await headers()).get("x-request-id"))
  const fields = {
    request_id: id,
    route: "/auth/restaurant_staff/emailpass",
    method: "POST",
  }
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!email || !password) {
    log("auth.sign_in.failed", { ...fields, status: 400 })
    return { error: "sign_in_failed" }
  }
  let token: string
  let session: StaffSession
  try {
    const result = await createPartnerSdk(id).auth.login(
      "restaurant_staff",
      "emailpass",
      {
        email,
        password,
      },
    )
    if (typeof result !== "string") {
      log("auth.sign_in.failed", fields)
      return { error: "unknown_error" }
    }
    token = result
    fields.route = "/partner/me"
    fields.method = "GET"
    session = await retrieveStaffSession(token, id)
  } catch (error) {
    const status = httpStatus(error)
    log("auth.sign_in.failed", { ...fields, status })
    if (error instanceof FetchError && error.status === 401)
      return { error: "sign_in_failed" }
    return { error: "unknown_error" }
  }
  if (session.status !== "authorized") {
    log("auth.sign_in.failed", {
      ...fields,
      route: "/partner/me",
      method: "GET",
      status:
        session.status === "ended" && session.code === "staff_access_revoked"
          ? 403
          : 401,
    })
    if (session.status === "signed_out") return { error: "sign_in_failed" }

    // A login that never became staff gets the same message as a wrong
    // password, so the form does not reveal which emails have a login.
    return session.code === "staff_access_revoked"
      ? {
          error: "staff_access_revoked",
          restaurant_name: session.restaurant_name,
        }
      : { error: "sign_in_failed" }
  }
  await storePartnerToken(token)
  log("auth.sign_in.succeeded", {
    ...fields,
    actor_type: "restaurant_staff",
    actor_id: session.current.staff.id,
    restaurant_id: session.current.restaurant.id,
  })
  redirect("/overview")
}

export async function signOut() {
  log("auth.session.ended", {
    request_id: requestId((await headers()).get("x-request-id")),
    route: "/sign-out",
    method: "POST",
  })
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
