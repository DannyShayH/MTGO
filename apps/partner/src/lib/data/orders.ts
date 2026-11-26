import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { log } from "@lib/logger"
import { sessionEndedCode } from "./staff"

import type {
  CancellationCategory,
  DeliveryOutcome,
  OrderView,
} from "@lib/order-queue"

export {
  ORDER_VIEWS,
  type CancellationCategory,
  type DeliveryOutcome,
  type OrderView,
} from "@lib/order-queue"
export const ORDERS_PAGE_SIZE = 20

/** Optional narrowing of a view, as `GET /partner/orders` takes it. */
export type OrderFilters = {
  q?: string
  placed_from?: string
  placed_to?: string
  cancellation_category?: CancellationCategory
  delivery_outcome?: DeliveryOutcome
}

export type OrderState =
  "awaiting_acceptance" | "accepted" | "preparing" | "ready" | "cancelled"

/** What the backend decided about the acceptance window at `server_time`. */
export type AcceptanceWindow = "open" | "elapsed" | "unavailable"

type Bilingual = { da: string; en: string }

export type DeclaredAllergen = {
  number: number
  code: string
  name: Bilingual
  details: { code: string; name: Bilingual }[]
}

/**
 * A dish as purchased, in both languages. `unavailable` for an Order placed
 * before these facts were recorded; never filled from today's menu.
 */
export type KitchenFacts =
  | {
      status: "preserved"
      name: Bilingual
      allergens:
        | { status: "unknown" }
        | {
            status: "supplied"
            contains: DeclaredAllergen[]
            may_contain: DeclaredAllergen[]
            none_declared: boolean
          }
      labels: {
        code: string
        name: Bilingual
        description: Bilingual
        state: "yes" | "no" | "unknown"
      }[]
    }
  | { status: "unavailable" }

/** The kitchen's guarded milestones, in order (#142, #146). */
export type MilestoneAction = "accept" | "start_preparation" | "ready"
export type OrderAction = MilestoneAction | "reject"

/**
 * The purchased financial basis frozen at paid placement (#226), present
 * only while the backend releases Restaurant statements (ADR-0022). Amounts
 * are exact decimal strings, never floats.
 */
export type FinancialBasis =
  | {
      status: "preserved"
      restaurant_id: string
      placed_at: string
      currency_code: string
      order_version: number
      terms: {
        terms_version: string
        agreement_id: string
        agreed_at: string
        prices_include_vat: true
        vat_rate: string
        commission_tiers: {
          from_amount: string
          to_amount: string | null
          rate_percent: string
        }[]
        monthly_service_fee: { amount: string; currency_code: string }
      }
      lines: {
        line_item_id: string
        variant_id: string | null
        quantity: string
        unit_price_including_vat: string
        total_including_vat: string
      }[]
      food_value_including_vat: string
      food_value_excluding_vat: string
    }
  | { status: "unavailable" }

export type RestaurantOrder = {
  id: string
  display_id: number
  state: OrderState
  placed_at: string | null
  acceptance_deadline: string | null
  acceptance_window: AcceptanceWindow
  accepted_at: string | null
  preparation_started_at: string | null
  ready_at: string | null
  /** What staff may do now, as the backend decided at `server_time`. */
  available_actions: OrderAction[]
  /** Null until cancelled. The note is the rejecting staff's own, never the Customer's. */
  cancellation: {
    category: CancellationCategory
    cancelled_at: string
    /** When it took effect: the deadline for a timeout, else `cancelled_at`. */
    effective_at: string
    note: string | null
  } | null
  /**
   * When the agent collected the food (#254), and how and when the delivery
   * ended (#204); null until either happened. Only times, never the agent.
   * A cancelled Order's cancellation stays the reason it ended.
   */
  delivery: {
    picked_up_at: string | null
    outcome: DeliveryOutcome | null
    ended_at: string | null
  } | null
  /** The owed full refund; `failed` means still owed, never money returned. */
  refund: {
    status: "pending" | "failed" | "succeeded"
    amount_including_vat: number
    currency_code: string
  } | null
  /** The MTOGO-funded prepared-food credit owed to the Restaurant (#162). */
  food_credit: {
    amount_excluding_vat: number
    currency_code: string
    funded_by: "mtogo"
  } | null
  currency_code: string
  total_including_vat: number
  items: {
    id: string
    name: string
    quantity: number
    unit_price_including_vat: number
    total_including_vat: number
    purchased: KitchenFacts
  }[]
  /** Absent while the backend withholds it; only the Order detail carries it. */
  financial_basis?: FinancialBasis
  /**
   * The Customer's food rating (1-5), `null` when undelivered or unrated, and
   * absent while Feedback is withheld (#249). Only the Order detail carries it.
   */
  food_rating?: number | null
}

export type OrdersPage = {
  orders: RestaurantOrder[]
  count: number
  offset: number
  limit: number
  server_time: string
}

async function partnerFetch<T>(path: string): Promise<T> {
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  return sdk.client.fetch<T>(path, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  })
}

/**
 * Ends the session when access ended (redirect throws, so it is never
 * swallowed); any other failure is logged and shown as unavailable.
 */
function unavailableUnlessSessionEnded(route: string, error: unknown): null {
  const code = sessionEndedCode(error)
  if (code) redirect(`/session-ended?code=${code}`)
  log("upstream.request.failed", {
    route,
    method: "GET",
    status: error instanceof FetchError ? error.status : undefined,
  })
  return null
}

/** One page of the staff member's Restaurant queue; `null` when the backend failed. */
export async function listOrders(
  view: OrderView,
  offset: number,
  filters: OrderFilters = {},
): Promise<OrdersPage | null> {
  const query = new URLSearchParams({
    view,
    limit: String(ORDERS_PAGE_SIZE),
    offset: String(offset),
  })
  for (const [key, value] of Object.entries(filters))
    if (value) query.set(key, value)
  try {
    return await partnerFetch<OrdersPage>(`/partner/orders?${query}`)
  } catch (error) {
    return unavailableUnlessSessionEnded("/partner/orders", error)
  }
}

/** One Order of the staff member's Restaurant; any other Order is "not_found". */
export async function retrieveOrder(
  id: string,
): Promise<
  { order: RestaurantOrder; server_time: string } | "not_found" | null
> {
  try {
    return await partnerFetch(`/partner/orders/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) return "not_found"
    return unavailableUnlessSessionEnded("/partner/orders/:id", error)
  }
}
