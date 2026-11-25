"use server"

import { FetchError } from "@medusajs/js-sdk"
import { sdk } from "@lib/config"
import { logUpstreamFailure } from "@lib/logger"
import {
  locationChoices,
  type LocationChoice,
  type RegisteredPostalCode,
} from "@lib/util/location-choices"
import type { LocationQuery } from "@lib/util/location-query"

export type PublicRestaurant = {
  id: string
  name: string
  address_city: string
  is_open: boolean
  receiving_new_orders: boolean
  reason: string | null
  cover: { url: string } | null
  delivery_area_match?: {
    served_postal_codes: number
    location_postal_codes: number
  }
}

export type SelectedLocation = {
  kind: "postal_code" | "town"
  postal_code?: string
  name: string
  postal_codes: number
}

export type RestaurantListing = {
  restaurants: PublicRestaurant[]
  count: number
  location: SelectedLocation | null
}

export type RestaurantListingResult =
  | { state: "listed"; listing: RestaurantListing }
  | { state: "location_refused"; refused: "postal_code" | "town" }
  | { state: "failed" }

/**
 * The active Restaurants, never from a cache, filtered by the selected
 * location. A refused location (unknown code or town) is reported as such,
 * never replaced by the unfiltered list.
 */
export async function listRestaurants(
  query: LocationQuery,
): Promise<RestaurantListingResult> {
  try {
    const listing = await sdk.client.fetch<RestaurantListing>(
      "/store/restaurants",
      {
        method: "GET",
        query: {
          ...(query.postal_code ? { postal_code: query.postal_code } : {}),
          ...(query.town ? { town: query.town } : {}),
        },
        cache: "no-store",
      },
    )
    return { state: "listed", listing }
  } catch (error) {
    const status = error instanceof FetchError ? error.status : undefined
    if (status === 400 && (query.postal_code || query.town))
      return {
        state: "location_refused",
        refused: query.postal_code ? "postal_code" : "town",
      }
    logUpstreamFailure({ status })
    return { state: "failed" }
  }
}

export type LocationLookupResult =
  { state: "found"; choices: LocationChoice[] } | { state: "failed" }

/** Towns, municipalities and postcode prefixes from the Danish register, as the operator picker searches them. */
export async function searchLocations(
  q: string,
): Promise<LocationLookupResult> {
  const text = q.trim().slice(0, 255)
  if (!text) return { state: "found", choices: [] }
  try {
    const { postal_codes } = await sdk.client.fetch<{
      postal_codes: RegisteredPostalCode[]
    }>("/store/postal-codes", {
      method: "GET",
      query: { q: text },
      cache: "no-store",
    })
    return { state: "found", choices: locationChoices(text, postal_codes) }
  } catch (error) {
    logUpstreamFailure({
      status: error instanceof FetchError ? error.status : undefined,
    })
    return { state: "failed" }
  }
}
