"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { FetchError } from "@medusajs/js-sdk"
import type { MessageCode } from "@dtc/i18n"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { requireCurrentStaff, sessionEndedCode } from "./staff"

export type OpeningState = { error?: MessageCode }

/**
 * Opens or closes the signed-in staff member's own Restaurant (spec stories
 * 49-52). Success or failure, the Overview is read again, so the switch shows
 * the Restaurant's real state next to any refusal.
 */
export async function changeOpening(
  _previous: OpeningState,
  isOpening: boolean,
): Promise<OpeningState> {
  const current = await requireCurrentStaff()
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const action = isOpening ? "open" : "close"
  let state: OpeningState = {}
  try {
    await sdk.client.fetch(
      `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/${action}`,
      { method: "POST", headers: { authorization: `Bearer ${token}` } },
    )
  } catch (error) {
    const ended = sessionEndedCode(error)
    if (ended) redirect(`/session-ended?code=${ended}`)
    const status = error instanceof FetchError ? error.status : undefined
    // 400 is the one refusal these routes have: opening while inactive.
    if (status === 400) state = { error: "restaurant_inactive_cannot_open" }
    else {
      console.error("Partner opening change failed", { action, status })
      state = { error: "unknown_error" }
    }
  }
  revalidatePath("/overview")
  return state
}
