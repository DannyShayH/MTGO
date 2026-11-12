"use server"

import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import type { MessageCode } from "@dtc/i18n"
import { sdk } from "@lib/config"
import { MIN_PASSWORD_LENGTH } from "@lib/password"
import { storePartnerToken } from "@lib/partner-token"
import { retrieveInvitation } from "./invitation"

export type AcceptInvitationState = { error?: MessageCode }

/**
 * The staff id a Medusa token carries, if any. Only read to tell a fresh login
 * from one that already acts as staff; the backend verifies every token.
 */
function tokenActorId(token: string): string | undefined {
  try {
    const claims: { actor_id?: unknown } = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    )
    return typeof claims.actor_id === "string" && claims.actor_id
      ? claims.actor_id
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Registers the invited email with the chosen password. A retry after a
 * failed accept finds the login already registered, so it signs in with it
 * instead; a different password then fails like a wrong password.
 */
async function registerInvitedLogin(email: string, password: string) {
  try {
    return await sdk.auth.register("restaurant_staff", "emailpass", {
      email,
      password,
    })
  } catch (error) {
    if (!(error instanceof FetchError && error.status === 401)) throw error
    const token = await sdk.auth.login("restaurant_staff", "emailpass", {
      email,
      password,
    })
    if (typeof token !== "string" || tokenActorId(token))
      throw new FetchError("sign_in_failed", "Unauthorized", 401)
    return token
  }
}

/**
 * Accepts an invitation as Medusa's admin invite does: register the login,
 * accept with the registration token, then sign in so the token carries the
 * staff id. The email always comes from the invitation, never from the form.
 */
export async function acceptInvitation(
  _previous: AcceptInvitationState,
  form: FormData,
): Promise<AcceptInvitationState> {
  const invitationToken = String(form.get("token") ?? "")
  const password = String(form.get("password") ?? "")
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: "password_too_short" }
  let token: string
  try {
    const invitation = await retrieveInvitation(invitationToken)
    if (!invitation) return { error: "invitation_invalid" }
    const { email } = invitation.staff
    const registration = await registerInvitedLogin(email, password)
    await sdk.client.fetch("/partner/staff-invitations/accept", {
      method: "POST",
      body: { token: invitationToken },
      headers: { authorization: `Bearer ${registration}` },
    })
    const signedIn = await sdk.auth.login("restaurant_staff", "emailpass", {
      email,
      password,
    })
    if (typeof signedIn !== "string") return { error: "unknown_error" }
    token = signedIn
  } catch (error) {
    // The app registers the invitation's own email, so a 400 from accept
    // means the link stopped working meanwhile (coding standard 7.2).
    if (error instanceof FetchError && error.status === 400)
      return { error: "invitation_invalid" }
    if (error instanceof FetchError && error.status === 401)
      return { error: "sign_in_failed" }
    console.error("Partner invitation accept failed", {
      status: error instanceof FetchError ? error.status : undefined,
    })
    return { error: "unknown_error" }
  }
  await storePartnerToken(token)
  redirect("/overview")
}
