"use server"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requestId } from "@dtc/logging"
import { isPhotoErrorCode, type PhotoErrorCode } from "@dtc/i18n"
import { BACKEND_URL, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { requireCurrentStaff } from "./staff"

export async function attachPhoto(
  kind: "dish" | "cover",
  resourceId: string,
  revision: number,
  form: FormData,
): Promise<{ error?: PhotoErrorCode; url?: string }> {
  const current = await requireCurrentStaff()
  const file = form.get("photo")
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
    return { error: "photo_invalid" }
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const id = requestId((await headers()).get("x-request-id"))
  const content = Buffer.from(await file.arrayBuffer()).toString("base64")
  const path =
    kind === "cover"
      ? `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/cover`
      : `/partner/restaurants/${encodeURIComponent(current.restaurant.id)}/dishes/${encodeURIComponent(resourceId)}/photo`
  let response: Response
  try {
    response = await fetch(new URL(path, BACKEND_URL), {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": id,
      },
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        revision,
        content,
      }),
    })
  } catch {
    return { error: "unknown_error" }
  }
  if (response.status === 401 || response.status === 403)
    redirect(
      `/session-ended?code=${response.status === 401 ? "session_expired" : "staff_access_revoked"}`,
    )
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code =
      result && typeof result === "object" && "code" in result
        ? result.code
        : undefined
    return { error: isPhotoErrorCode(code) ? code : "unknown_error" }
  }
  const attachment =
    result &&
    typeof result === "object" &&
    (kind === "cover" ? "cover" in result : "photo" in result)
      ? kind === "cover"
        ? (result as { cover: { url: string } }).cover
        : (result as { photo: { url: string } }).photo
      : null
  if (!attachment?.url) return { error: "unknown_error" }
  revalidatePath(kind === "cover" ? "/overview" : "/menu")
  return { url: attachment.url }
}
