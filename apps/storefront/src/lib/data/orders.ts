"use server"

import { retrieveBasketDishes } from "./basket-dishes"
import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { getAuthHeaders } from "./cookies"
import { HttpTypes } from "@medusajs/types"
import { log } from "@lib/logger"
import {
  customerCancelErrorCode,
  type CustomerCancelErrorCode,
  type CustomerFeedbackErrorCode,
} from "@dtc/i18n"
import type { FeedbackRatings } from "@lib/util/feedback-ratings"

export const retrieveOrder = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderResponse>(`/store/orders/${id}`, {
      method: "GET",
      query: {
        fields:
          // The Restaurant's id finds the dishes' menu photos (#147).
          "+metadata,+restaurant.id,*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product",
      },
      headers,
      cache: "no-store",
    })
    .then(async ({ order }) => (await withMenuPhotos([order]))[0])
    .catch((err) => medusaError(err))
}

export const listOrders = async (
  limit: number = 10,
  offset: number = 0,
  filters?: Record<string, unknown>,
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderListResponse>(`/store/orders`, {
      method: "GET",
      query: {
        limit,
        offset,
        order: "-created_at",
        fields: "*items,+items.metadata,*items.variant,*items.product",
        ...filters,
      },
      headers,
      cache: "no-store",
    })
    .then(({ orders }) => orders)
    .catch((err) => medusaError(err))
}

/** A single Customer-owned history page; failures are left to the caller. */
export const listOrderPage = async (
  limit: number,
  offset: number,
  status?: string,
) => {
  const headers = await getAuthHeaders()
  const result = await sdk.client.fetch<HttpTypes.StoreOrderListResponse>(
    "/store/orders",
    {
      method: "GET",
      query: {
        limit,
        offset,
        order: "-created_at",
        fields: "+metadata,*items,+items.metadata",
        ...(status ? { status } : {}),
      },
      headers,
      cache: "no-store",
    },
  )
  return result
}

/** Classify private detail failures without exposing upstream messages. */
export const retrieveAccountOrder = async (id: string) => {
  try {
    return { state: "success" as const, order: await retrieveOrder(id) }
  } catch (error) {
    const status = (error as { status?: number }).status
    return {
      state:
        status === 401 || status === 403 || status === 404
          ? ("not_found" as const)
          : ("failed" as const),
    }
  }
}

/** The owning Customer's progress read (#143); refund outcome kept apart. */
export type OrderProgress = {
  order_id: string
  state:
    "awaiting_acceptance" | "accepted" | "preparing" | "ready" | "cancelled"
  placed_at: string | null
  accepted_at: string | null
  /** Food milestones recorded by the Restaurant (#146). */
  preparation_started_at: string | null
  ready_at: string | null
  delivery: {
    assigned_at: string | null
    picked_up_at: string | null
    delivered_at: string | null
    ended_at: string | null
    outcome: "delivered" | "cancelled" | "failed" | null
  } | null
  /** Unknown includes follow-up whose producer is not connected yet. */
  follow_up: { status: "unknown" | "pending" | "settled" }
  /** What the Customer may do now, decided at the server's time (#145). */
  available_actions: "cancel"[]
  cancellation: {
    category:
      | "restaurant_rejected"
      | "acceptance_timeout"
      | "customer_cancelled"
      | "unassigned_timeout"
    cancelled_at: string
    /** When it took effect: the deadline for a timeout, else `cancelled_at`. */
    effective_at: string
  } | null
  refund: {
    status: "pending" | "failed" | "succeeded"
    amount_including_vat: number
    currency_code: string
  } | null
}

/**
 * One progress read: the projection with the server's time of reading it,
 * a refusal (another Customer's, unknown or unpublished Order, or signed
 * out), or a failure the caller shows as stale.
 */
export type OrderProgressRead =
  | { state: "success"; progress: OrderProgress; server_time: string }
  | { state: "not_found" }
  | { state: "failed" }

/**
 * The authorized progress read (#143), also called from the open Order page
 * to refresh its timeline (#147). Progress is additional to the Order
 * details: when it cannot be read, the page still shows the purchase. A
 * refusal is expected and not logged; any other failure is.
 */
export async function readOrderProgress(
  id: string,
): Promise<OrderProgressRead> {
  try {
    const { progress, server_time } = await sdk.client.fetch<{
      progress: OrderProgress
      server_time: string
    }>(`/store/orders/${encodeURIComponent(id)}/tracking`, {
      method: "GET",
      headers: await getAuthHeaders(),
      cache: "no-store",
    })
    return { state: "success", progress, server_time }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403 || status === 404)
      return { state: "not_found" }
    log("upstream.request.failed", {
      route: "/store/orders/:id/tracking",
      method: "GET",
      status,
    })
    return { state: "failed" }
  }
}

export type CancelOrderResult =
  { ok: true } | { ok: false; error: CustomerCancelErrorCode }

/**
 * The owning Customer cancels their awaiting Order before acceptance (#145).
 * The backend decides at its own time whether it is still the Customer's
 * cancellation, the timeout, or refused, and starts the full refund. The
 * caller re-reads the page afterwards, so every outcome, including an
 * uncertain one, is followed by the recorded truth instead of a guess.
 */
export async function cancelOrder(id: string): Promise<CancelOrderResult> {
  try {
    await sdk.client.fetch(`/store/orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: {},
      headers: await getAuthHeaders(),
      cache: "no-store",
    })
    return { ok: true }
  } catch (error) {
    const status = (error as { status?: number }).status
    log("upstream.request.failed", {
      route: "/store/orders/:id/cancel",
      method: "POST",
      status,
    })
    // A refusal's message is its code; anything else is uncertain.
    const code =
      status === 400 || status === 409
        ? (error as { message?: unknown }).message
        : undefined
    return { ok: false, error: customerCancelErrorCode(code) }
  }
}

/** The owning Customer's Feedback state on an Order (#218). */
export type OrderFeedback = {
  feedback: (FeedbackRatings & { submitted_at: string }) | null
  can_submit: boolean
  /** Null until the Feedback window lands with its own work item. */
  closes_at: string | null
}

/**
 * The Feedback read, or `hidden` when the page shows no Feedback section:
 * the `feedback` flag is off (the backend answers 404), the Customer may not
 * read it, or it could not be read. Feedback is additional to the Order, so
 * a failure never blocks the page; it is logged.
 */
export type OrderFeedbackRead =
  { state: "success"; feedback: OrderFeedback } | { state: "hidden" }

/**
 * The status of a failed Feedback request, logged unless it is one of the
 * expected answers the caller handles itself.
 */
function feedbackFailureStatus(
  error: unknown,
  method: "GET" | "POST",
  expected: number[],
): number | undefined {
  const status = (error as { status?: number }).status
  if (status === undefined || !expected.includes(status))
    log("upstream.request.failed", {
      route: "/store/orders/:id/feedback",
      method,
      status,
    })
  return status
}

export async function readOrderFeedback(
  id: string,
): Promise<OrderFeedbackRead> {
  try {
    const feedback = await sdk.client.fetch<OrderFeedback>(
      `/store/orders/${encodeURIComponent(id)}/feedback`,
      { method: "GET", headers: await getAuthHeaders(), cache: "no-store" },
    )
    return { state: "success", feedback }
  } catch (error) {
    feedbackFailureStatus(error, "GET", [401, 404])
    return { state: "hidden" }
  }
}

export type SubmitFeedbackResult =
  | { ok: true; feedback: OrderFeedback }
  | { ok: false; error: CustomerFeedbackErrorCode }

/**
 * Sends the Customer's three ratings once (#218). A repeat, a double click
 * or a retry after a lost response is answered with the recorded ratings,
 * read back here because the refusal carries no body the SDK keeps. The SDK
 * keeps only the status, so a `400` is told apart by that same read: an
 * Order that cannot be rated, or else ratings the backend refused.
 */
export async function submitOrderFeedback(
  id: string,
  ratings: FeedbackRatings,
): Promise<SubmitFeedbackResult> {
  try {
    const feedback = await sdk.client.fetch<OrderFeedback>(
      `/store/orders/${encodeURIComponent(id)}/feedback`,
      {
        method: "POST",
        body: ratings,
        headers: await getAuthHeaders(),
        cache: "no-store",
      },
    )
    return { ok: true, feedback }
  } catch (error) {
    const status = feedbackFailureStatus(error, "POST", [400, 409])
    // The first submission may have counted, and a refusal is told apart by
    // the Order's state: read what was recorded.
    if (
      status === 400 ||
      status === 409 ||
      status === undefined ||
      status >= 500
    ) {
      const read = await readOrderFeedback(id)
      if (read.state === "success") {
        if (read.feedback.feedback) return { ok: true, feedback: read.feedback }
        if (status === 400)
          return {
            ok: false,
            error: read.feedback.can_submit
              ? "feedback_ratings_invalid"
              : "order_not_delivered",
          }
      }
    }
    return { ok: false, error: "unknown_error" }
  }
}

/**
 * A thumbnail the Customer's browser can load. A dish's product thumbnail is
 * the Admin-only photo route (`/admin/products/:id/dish/photo`), which a
 * Customer cannot open, so only an absolute http(s) URL counts.
 */
const isViewable = (url: string | null | undefined): url is string =>
  !!url && /^https?:\/\//.test(url)

/** Order lines carry no viewable photo: menu photos are stored separately.
 * Only decorate images the Customer cannot load; recorded purchase names,
 * quantities and prices stay intact.
 */
async function withMenuPhotos(orders: HttpTypes.StoreOrder[]) {
  const menus = new Map<string, ReturnType<typeof retrieveBasketDishes>>()
  return Promise.all(
    orders.map(async (order) => {
      const restaurant = (
        order as HttpTypes.StoreOrder & { restaurant?: { id: string } | null }
      ).restaurant
      const lineRestaurantId = order.items?.find(
        (item) => typeof item.metadata?.mtogo_restaurant_id === "string",
      )?.metadata?.mtogo_restaurant_id
      const restaurantId =
        restaurant?.id ??
        (typeof lineRestaurantId === "string" ? lineRestaurantId : undefined)
      if (
        !restaurantId ||
        !order.items?.some((item) => !isViewable(item.thumbnail))
      )
        return order
      if (!menus.has(restaurantId))
        menus.set(restaurantId, retrieveBasketDishes(restaurantId))
      const menu = await menus.get(restaurantId)
      if (!menu) return order
      return {
        ...order,
        items: order.items?.map((item) => ({
          ...item,
          thumbnail: isViewable(item.thumbnail)
            ? item.thumbnail
            : (item.variant_id
                ? menu.dishes[item.variant_id]?.photoUrl
                : null) || null,
        })),
      }
    }),
  )
}
