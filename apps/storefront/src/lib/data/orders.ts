"use server"

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
    .then(({ order }) => order)
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
export const listOrderPage = async (limit: number, offset: number) => {
  const headers = await getAuthHeaders()
  return sdk.client.fetch<HttpTypes.StoreOrderListResponse>("/store/orders", {
    method: "GET",
    query: { limit, offset, order: "-created_at", fields: "+metadata" },
    headers,
    cache: "no-store",
  })
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
