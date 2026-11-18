"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requestId } from "@dtc/logging"
import { isOrderActionErrorCode, type OrderActionErrorCode } from "@dtc/i18n"
import { BACKEND_URL, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { log } from "@lib/logger"
import type { RestaurantOrder } from "./orders"

export type OrderActionResult = {
  /** The Order as the backend reports it now, also after a refusal. */
  order?: RestaurantOrder
  error?: OrderActionErrorCode
}

type OrderAction = "accept" | "reject"

/**
 * Accepts one of the staff member's Restaurant's Orders. The backend decides
 * the time and the actor; the browser only names the Order. Every outcome
 * revalidates the Orders pages, so an uncertain result is followed by a
 * fresh read instead of a guess.
 */
export async function acceptOrder(orderId: string): Promise<OrderActionResult> {
  return postOrderAction(orderId, "accept", {})
}

/**
 * Rejects an awaiting Order with an optional reason (#143). The backend
 * cancels it and starts the full refund; time, actor and amount are its own.
 */
export async function rejectOrder(
  orderId: string,
  reason: string,
): Promise<OrderActionResult> {
  return postOrderAction(orderId, "reject", reason.trim() ? { reason } : {})
}

async function postOrderAction(
  orderId: string,
  action: OrderAction,
  payload: Record<string, string>,
): Promise<OrderActionResult> {
  const route = `/partner/orders/:id/${action}`
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  const correlationId = requestId((await headers()).get("x-request-id"))
  let response: Response
  try {
    response = await fetch(
      new URL(
        `/partner/orders/${encodeURIComponent(orderId)}/${action}`,
        BACKEND_URL,
      ),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-request-id": correlationId,
        },
        body: JSON.stringify(payload),
      },
    )
  } catch {
    log("upstream.request.failed", {
      request_id: correlationId,
      route,
      method: "POST",
    })
    revalidatePath("/orders", "layout")
    return { error: "unknown_error" }
  }
  if (response.status === 401 || response.status === 403)
    redirect(
      `/session-ended?code=${response.status === 401 ? "session_expired" : "staff_access_revoked"}`,
    )
  const body = (await response.json().catch(() => null)) as {
    order?: RestaurantOrder
    code?: unknown
  } | null
  revalidatePath("/orders", "layout")
  if (response.ok) return { order: body?.order }
  log("upstream.request.failed", {
    request_id: correlationId,
    route,
    method: "POST",
    status: response.status,
  })
  const code = body?.code
  return {
    order: body?.order,
    error: isOrderActionErrorCode(code) ? code : "unknown_error",
  }
}
