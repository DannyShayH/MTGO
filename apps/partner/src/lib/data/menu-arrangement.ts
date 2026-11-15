"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requestId } from "@dtc/logging"
import { isMenuArrangementError, type MenuArrangementError } from "@dtc/i18n"
import { BACKEND_URL, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { log } from "@lib/logger"
import { requireCurrentStaff } from "./staff"
import type { StaffDish } from "./menu-dishes"
import type { MenuCategory } from "./menu-categories"

export type MenuArrangement = {
  revision: string
  categories: (MenuCategory & { dishes: StaffDish[] })[]
}
export type ArrangementCommand = { revision: string } & (
  | { kind: "categories"; ids: string[] }
  | { kind: "dishes"; category_id: string; ids: string[] }
  | { kind: "move"; dish_id: string; source_id: string; target_id: string }
)
export async function menuArrangementRequest(
  command?: ArrangementCommand,
): Promise<{
  menu?: MenuArrangement
  error?: MenuArrangementError
}> {
  const current = await requireCurrentStaff()
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const id = requestId((await headers()).get("x-request-id"))
  const method = command ? "POST" : "GET"
  let response: Response
  try {
    response = await fetch(
      new URL(
        `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/menu-arrangement`,
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
        ...(command ? { body: JSON.stringify(command) } : {}),
      },
    )
  } catch {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/menu-arrangement",
      method,
    })
    return { error: "unknown_error" }
  }
  if (response.status === 401 || response.status === 403)
    redirect(
      `/session-ended?code=${response.status === 401 ? "session_expired" : "staff_access_revoked"}`,
    )
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/menu-arrangement",
      method,
      status: response.status,
    })
    return {
      error: isMenuArrangementError(data?.code) ? data.code : "unknown_error",
      menu: data?.menu,
    }
  }
  if (
    !data ||
    typeof data.revision !== "string" ||
    !Array.isArray(data.categories)
  )
    return { error: "unknown_error" }
  if (command) {
    revalidatePath("/menu")
    revalidatePath("/categories")
  }
  return { menu: data }
}
