"use server"

import { cookies, headers } from "next/headers"
import { httpStatus, requestId } from "@dtc/logging"
import { createPartnerSdk, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { getLocale } from "@lib/i18n"
import { log } from "@lib/logger"
import {
  RECOVERY_ACCOUNTS,
  validateRecoveryPassword,
  type RecoveryActor,
} from "@lib/password-recovery"

export type RecoveryState = {
  sent?: boolean
  success?: boolean
  error?: "invalid" | "mismatch" | "too_short" | "failed"
}

export async function requestPasswordReset(
  actor: RecoveryActor,
  _previous: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  if (
    actor !== "restaurant_staff" &&
    actor !== "delivery_agent" &&
    actor !== "user"
  )
    return { error: "failed" }
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email) return { error: "failed" }
  const id = requestId((await headers()).get("x-request-id"))
  try {
    await createPartnerSdk(id).auth.resetPassword(
      actor,
      RECOVERY_ACCOUNTS[actor].provider,
      {
        identifier: email,
        metadata: { language: actor === "user" ? "en" : await getLocale() },
      },
    )
  } catch (error) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/auth/:actor_type/:auth_provider/reset-password",
      method: "POST",
      status: httpStatus(error),
    })
    return { error: "failed" }
  }
  return { sent: true }
}

export async function resetPassword(
  actor: RecoveryActor,
  _previous: RecoveryState,
  form: FormData,
): Promise<RecoveryState> {
  if (
    actor !== "restaurant_staff" &&
    actor !== "delivery_agent" &&
    actor !== "user"
  )
    return { error: "failed" }
  const token = String(form.get("token") ?? "")
  if (!token) return { error: "invalid" }
  const password = String(form.get("password") ?? "")
  const invalid = validateRecoveryPassword(
    password,
    String(form.get("confirmation") ?? ""),
  )
  if (invalid) return { error: invalid }
  const id = requestId((await headers()).get("x-request-id"))
  try {
    await createPartnerSdk(id).auth.updateProvider(
      actor,
      RECOVERY_ACCOUNTS[actor].provider,
      { password },
      token,
    )
  } catch (error) {
    const status = httpStatus(error)
    log("upstream.request.failed", {
      request_id: id,
      route: "/auth/:actor_type/:auth_provider/update",
      method: "POST",
      status,
    })
    return { error: status === 401 ? "invalid" : "failed" }
  }
  if (actor !== "user") (await cookies()).delete(PARTNER_TOKEN_COOKIE)
  return { success: true }
}
