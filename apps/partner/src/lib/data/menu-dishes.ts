"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requestId } from "@dtc/logging"
import { isDishErrorCode, type DishErrorCode } from "@dtc/i18n"
import { BACKEND_URL, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { requireCurrentStaff } from "./staff"
import { log } from "@lib/logger"

export type CreateDish = {
  request_id: string
  category_id: string
  name: { da: string; en: string }
  price: string
}
export type StaffDish = {
  id: string
  name: { da: string; en: string }
  price: { amount: number; currency_code: "dkk" }
}
export type StaffMenu = {
  categories: {
    id: string
    name: { da: string; en: string }
    dishes: StaffDish[]
  }[]
}
export async function dishRequest(
  body?: CreateDish,
): Promise<{ menu?: StaffMenu; error?: DishErrorCode }> {
  const current = await requireCurrentStaff()
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const id = requestId((await headers()).get("x-request-id"))
  const method = body ? "POST" : "GET"
  let response: Response
  try {
    // As with categories, the server transport preserves the SDK's discarded error codes.
    response = await fetch(
      new URL(
        `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/dishes`,
        BACKEND_URL,
      ),
      {
        method,
        cache: "no-store",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-request-id": id,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    )
  } catch {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/dishes",
      method,
    })
    return { error: "unknown_error" }
  }
  if (response.status === 401 || response.status === 403)
    redirect(
      `/session-ended?code=${response.status === 401 ? "session_expired" : "staff_access_revoked"}`,
    )
  if (!response.ok) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/dishes",
      method,
      status: response.status,
    })
    const refusal: unknown = await response.json().catch(() => null)
    const code =
      refusal && typeof refusal === "object" && "code" in refusal
        ? refusal.code
        : undefined
    return { error: isDishErrorCode(code) ? code : "unknown_error" }
  }
  const menu: StaffMenu | undefined = await response
    .json()
    .catch(() => undefined)
  if (!menu || !Array.isArray(menu.categories)) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/dishes",
      method,
    })
    return { error: "unknown_error" }
  }
  if (body) revalidatePath("/menu")
  return { menu }
}
