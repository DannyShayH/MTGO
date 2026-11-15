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
  allergens: AllergenDeclaration | null
}
export type AllergenDeclaration =
  | { status: "unknown" }
  | {
      status: "supplied"
      contains: { allergen_id: string; detail_ids: string[] }[]
      may_contain: { allergen_id: string; detail_ids: string[] }[]
      none_declared: boolean
    }
export type EditDish = {
  request_id: string
  revision: number
  name: { da: string; en: string }
  description: { da: string; en: string } | null
  price: string
  allergens: AllergenDeclaration
}
export type StaffDish = {
  id: string
  revision: number
  is_sold_out: boolean
  name: { da: string; en: string }
  description: { da: string; en: string } | null
  price: { amount: number; currency_code: "dkk" }
  allergens: AllergenDeclaration
}
export type DishAvailability = {
  request_id: string
  revision: number
  is_sold_out: boolean
}
export type StaffMenu = {
  categories: {
    id: string
    name: { da: string; en: string }
    dishes: StaffDish[]
  }[]
}
export async function dishRequest(
  body?: CreateDish | EditDish,
  dishId?: string,
): Promise<{ menu?: StaffMenu; error?: DishErrorCode; dish?: StaffDish }> {
  const current = await requireCurrentStaff()
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const id = requestId((await headers()).get("x-request-id"))
  const method = body ? "POST" : "GET"
  let response: Response
  try {
    // As with categories, the server transport preserves the SDK's discarded error codes.
    response = await fetch(
      new URL(
        `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/dishes${dishId ? `/${encodeURIComponent(dishId)}` : ""}`,
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
    const dish =
      refusal && typeof refusal === "object" && "dish" in refusal
        ? (refusal.dish as StaffDish)
        : undefined
    return { error: isDishErrorCode(code) ? code : "unknown_error", dish }
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

export async function availabilityRequest(
  dishId: string,
  body: DishAvailability,
): Promise<{ dish?: StaffDish; error?: DishErrorCode }> {
  const current = await requireCurrentStaff()
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const id = requestId((await headers()).get("x-request-id"))
  let response: Response
  try {
    response = await fetch(
      new URL(
        `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/dishes/${encodeURIComponent(dishId)}/availability`,
        BACKEND_URL,
      ),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-request-id": id,
        },
        body: JSON.stringify(body),
      },
    )
  } catch {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/dishes/:dish_id/availability",
      method: "POST",
    })
    return { error: "unknown_error" }
  }
  if (response.status === 401 || response.status === 403)
    redirect(
      `/session-ended?code=${response.status === 401 ? "session_expired" : "staff_access_revoked"}`,
    )
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/dishes/:dish_id/availability",
      method: "POST",
      status: response.status,
    })
    const code =
      data && typeof data === "object" && "code" in data ? data.code : undefined
    const dish =
      data && typeof data === "object" && "dish" in data
        ? (data.dish as StaffDish)
        : undefined
    return { error: isDishErrorCode(code) ? code : "unknown_error", dish }
  }
  if (!data || typeof data !== "object" || !("dish" in data)) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/dishes/:dish_id/availability",
      method: "POST",
    })
    return { error: "unknown_error" }
  }
  revalidatePath("/menu")
  return { dish: data.dish as StaffDish }
}
