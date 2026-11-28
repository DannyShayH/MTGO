import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { log } from "@lib/logger"
import { sessionEndedCode } from "./staff"

/** A range of time: from `starts_at`, inclusive, to `ends_at`, exclusive. */
export type Period = { starts_at: string; ends_at: string }

export type OpenOrderStage =
  | "awaiting_acceptance"
  | "accepted_or_preparing"
  | "ready_unassigned"
  | "assigned_not_picked_up"
  | "picked_up"

export type CancellationCategory =
  | "restaurant_rejected"
  | "acceptance_timeout"
  | "customer_cancelled"
  | "unassigned_timeout"
  | "operator_cancelled"

export type UnfulfilledCause = CancellationCategory | "delivery_failed"
export type CauseGroup = "customer" | "restaurant" | "mtogo"

export type ProcessingExclusionReason = "no_placement_time" | "no_handover_time"

export type ProcessingTime = {
  period: Period
  included: number
  /** Whole seconds; null when no Order is included, never zero. */
  average_seconds: number | null
  exclusions: { reason: ProcessingExclusionReason; count: number }[]
}

/**
 * The staff member's own Restaurant's operations (#264), as
 * `GET /partner/restaurants/:id/operations` returns them: the operator's
 * definitions, without Full refunds, attention items, Delivery transit time
 * or the Customer rating.
 */
export type RestaurantOperations = {
  as_of: string
  scope: { type: "restaurant"; restaurant_id: string }
  open_orders: {
    period: { at: string }
    total: number
    stages: { stage: OpenOrderStage; count: number }[]
  }
  placements: {
    period: Period
    total: number
    cancelled: {
      total: number
      categories: { category: CancellationCategory; count: number }[]
    }
  }
  orders_per_hour: {
    period: Period
    total: number
    hours: {
      starts_at: string
      local_time: string
      utc_offset: string
      is_current: boolean
      count: number
    }[]
  }
  placements_per_day: {
    period: Period
    total: number
    days: { date: string; count: number }[]
    /** The total divided by seven, to one decimal (ADR-0015). */
    average_per_day: number
  }
  processing_time: ProcessingTime & {
    /** Whole percent; negative is faster. Null without both averages. */
    change_from_previous_7_days_percent: number | null
  }
  times_per_day: {
    period: Period
    processing_time: ProcessingTime
    days: {
      date: string
      processing_time: { included: number; average_seconds: number | null }
    }[]
  }
  unfulfilled_orders: {
    period: Period
    placed: number
    ended: number
    unfulfilled: number
    rate_percent: number | null
    causes: { cause: UnfulfilledCause; group: CauseGroup; count: number }[]
    groups: { group: CauseGroup; count: number }[]
    exclusions: { reason: "still_open"; count: number }[]
  }
}

/**
 * Ends the session when access ended; another Restaurant or a withheld
 * Feature is "not_found", and any other failure is logged and returned as
 * `null`, so the page shows a failed read instead of quiet zeros.
 */
export async function retrieveRestaurantOperations(
  restaurant_id: string,
): Promise<RestaurantOperations | "not_found" | null> {
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  try {
    return await sdk.client.fetch<RestaurantOperations>(
      `/partner/restaurants/${encodeURIComponent(restaurant_id)}/operations`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    )
  } catch (error) {
    const code = sessionEndedCode(error)
    if (code) redirect(`/session-ended?code=${code}`)
    if (error instanceof FetchError && error.status === 404) return "not_found"
    log("upstream.request.failed", {
      route: "/partner/restaurants/:id/operations",
      method: "GET",
      status: error instanceof FetchError ? error.status : undefined,
    })
    return null
  }
}
