"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requestId } from "@dtc/logging"
import { isCategoryErrorCode, type CategoryErrorCode } from "@dtc/i18n"
import { BACKEND_URL, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { log } from "@lib/logger"
import { requireCurrentStaff } from "./staff"

export type MenuCategory = {
  id: string
  name: { da: string; en: string }
  revision: number
}
export type CategoryResult = {
  category?: MenuCategory
  error?: CategoryErrorCode
}
export type CategoryCommand =
  | {
      kind: "create"
      request_id: string
      revision: 0
      name: MenuCategory["name"]
    }
  | {
      kind: "rename"
      category_id: string
      revision: number
      name: MenuCategory["name"]
    }
  | { kind: "remove"; category_id: string; revision: number }

/** As for /partner/me, use the server transport to retain structured codes that SDK 2.22.4 discards. */
async function categoryRequest(suffix: string, method: string, body?: object) {
  const current = await requireCurrentStaff()
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const id = requestId((await headers()).get("x-request-id"))
  const path = `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/categories${suffix}`
  let response: Response
  try {
    response = await fetch(new URL(path, BACKEND_URL), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": id,
      },
      cache: "no-store",
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/categories",
      method,
    })
    return { error: "unknown_error" as const }
  }
  if (response.status === 401 || response.status === 403)
    redirect(
      `/session-ended?code=${response.status === 401 ? "session_expired" : "staff_access_revoked"}`,
    )
  if (!response.ok) {
    log("upstream.request.failed", {
      request_id: id,
      route: "/partner/restaurants/:id/categories",
      method,
      status: response.status,
    })
    const refusal: unknown = await response.json().catch(() => null)
    const code =
      refusal && typeof refusal === "object" && "code" in refusal
        ? refusal.code
        : undefined
    const category =
      refusal && typeof refusal === "object" && "category" in refusal
        ? (refusal.category as MenuCategory)
        : undefined
    return {
      error: isCategoryErrorCode(code) ? code : ("unknown_error" as const),
      category,
    }
  }
  return { response }
}

export async function retrieveMenuCategories(): Promise<{
  categories?: MenuCategory[]
  error?: CategoryErrorCode
}> {
  const result = await categoryRequest("", "GET")
  return result.response ? result.response.json() : { error: result.error }
}

export async function changeMenuCategory(
  command: CategoryCommand,
): Promise<CategoryResult> {
  const suffix =
    command.kind === "create"
      ? ""
      : `/${encodeURIComponent(command.category_id)}`
  const body =
    command.kind === "create"
      ? {
          name: command.name,
          request_id: command.request_id,
          revision: command.revision,
        }
      : command.kind === "rename"
        ? { name: command.name, revision: command.revision }
        : { revision: command.revision }
  const result = await categoryRequest(
    suffix,
    command.kind === "remove" ? "DELETE" : "POST",
    body,
  )
  if (!result.response)
    return { error: result.error, category: result.category }
  const saved = await result.response.json()
  revalidatePath("/menu")
  return saved
}
