"use server"

import { retrieveBasketDishes } from "./basket-dishes"
import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { getAuthHeaders } from "./cookies"
import { HttpTypes } from "@medusajs/types"

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
