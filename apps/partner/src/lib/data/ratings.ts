import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { log } from "@lib/logger"
import type { RatingsPeriod } from "@lib/ratings-period"
import { sessionEndedCode } from "./staff"

export type RatingDistribution = Record<"1" | "2" | "3" | "4" | "5", number>

/** The own Restaurant's food rating for a period (#249): never who rated. */
export type FoodRatingStatistics = {
  period: { key: RatingsPeriod; from: string | null; to: string | null }
  food: {
    /** One decimal, or `null` when nobody rated: unrated is never zero. */
    average: number | null
    count: number
    distribution: RatingDistribution
    delivered_orders: number
  }
}

/**
 * Ends the session when access ended; a withheld Feature is "not_found", and
 * any other failure is logged and returned as `null`, so the page shows a
 * failed read instead of "No ratings yet".
 */
export async function retrieveFoodRating(
  restaurant_id: string,
  period: RatingsPeriod,
): Promise<FoodRatingStatistics | "not_found" | null> {
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  try {
    return await sdk.client.fetch<FoodRatingStatistics>(
      `/partner/restaurants/${encodeURIComponent(restaurant_id)}/feedback/statistics?period=${period}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    )
  } catch (error) {
    const code = sessionEndedCode(error)
    if (code) redirect(`/session-ended?code=${code}`)
    if (error instanceof FetchError && error.status === 404) return "not_found"
    log("upstream.request.failed", {
      route: "/partner/restaurants/:id/feedback/statistics",
      method: "GET",
      status: error instanceof FetchError ? error.status : undefined,
    })
    return null
  }
}
