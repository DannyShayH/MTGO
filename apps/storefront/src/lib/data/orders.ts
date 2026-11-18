"use server"

import { retrieveBasketDishes } from "./basket-dishes"
import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { getAuthHeaders } from "./cookies"
import { HttpTypes } from "@medusajs/types"
import { log } from "@lib/logger"

export const retrieveOrder = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderResponse>(`/store/orders/${id}`, {
      method: "GET",
      query: {
        fields:
          "+metadata,*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product",
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
  cancellation: {
    category:
      "restaurant_rejected" | "acceptance_timeout" | "customer_cancelled"
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
 * Progress is additional to the Order details: when it cannot be read, the
 * page still shows the purchase and simply omits the outcome panel. A
 * refused read (another Customer's or unknown Order) is expected and the
 * details page handles it; any other failure is logged.
 */
export const retrieveOrderProgress = async (
  id: string,
): Promise<OrderProgress | null> => {
  try {
    const { progress } = await sdk.client.fetch<{ progress: OrderProgress }>(
      `/store/orders/${encodeURIComponent(id)}/progress`,
      { method: "GET", headers: await getAuthHeaders(), cache: "no-store" },
    )
    return progress
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status !== 401 && status !== 404)
      log("upstream.request.failed", {
        route: "/store/orders/:id/progress",
        method: "GET",
        status,
      })
    return null
  }
}

/** Existing Orders may have no commerce thumbnail: menu photos are stored separately.
 * Only decorate missing images; recorded purchase names, quantities and prices stay intact.
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
      if (!restaurantId || !order.items?.some((item) => !item.thumbnail))
        return order
      if (!menus.has(restaurantId))
        menus.set(restaurantId, retrieveBasketDishes(restaurantId))
      const menu = await menus.get(restaurantId)
      if (!menu) return order
      return {
        ...order,
        items: order.items?.map((item) => ({
          ...item,
          thumbnail:
            item.thumbnail ||
            (item.variant_id ? menu.dishes[item.variant_id]?.photoUrl : null) ||
            null,
        })),
      }
    }),
  )
}
