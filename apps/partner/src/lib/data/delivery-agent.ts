"use server"

import { cookies, headers } from "next/headers"
import { redirect, unstable_rethrow } from "next/navigation"
import { revalidatePath } from "next/cache"
import { FetchError } from "@medusajs/js-sdk"
import type { ProblemCategory } from "@dtc/i18n"
import { requestId } from "@dtc/logging"
import {
  isDeliveryArrivalErrorCode,
  isDeliveryClaimErrorCode,
  isDeliveryContactAttemptErrorCode,
  isDeliveryHandoverErrorCode,
  isDeliveryPickupErrorCode,
  type DeliveryArrivalErrorCode,
  type DeliveryClaimErrorCode,
  type DeliveryContactAttemptErrorCode,
  type DeliveryHandoverErrorCode,
  type DeliveryPickupErrorCode,
} from "@dtc/i18n"
import {
  BACKEND_URL,
  createPartnerSdk,
  PARTNER_TOKEN_COOKIE,
} from "@lib/config"
import { log } from "@lib/logger"
import { cookieOptions, storePartnerToken } from "@lib/partner-token"
import { MIN_PASSWORD_LENGTH } from "@lib/password"

const FILTER_COOKIE = "mtogo_delivery_area_filter"
/** Where a refused (revoked) Delivery agent lands, with an honest notice. */
const AGENT_ACCESS_ENDED_PATH = "/delivery-sign-in?message=access_ended"
type CurrentAgent = {
  agent: { id: string; name: string }
  postal_codes: string[]
  /** The approved codes with their register town names. */
  areas: { postal_code: string; name: string | null }[]
}
type Invite = { id: string; name: string; email: string }
export type AgentActionState = {
  error?: "failed" | "invalid" | "wrong_credentials" | "ended"
}
export type AvailableDelivery = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_address: string
  destination_postal_code: string
  preparation_status: "accepted" | "preparing" | "ready"
  accepted_at: string
  claim_deadline: string
  /** The route distance from pickup to the Customer (#191), or null. */
  trip_distance_km: number | null
}

/** The responsible agent's current delivery, with the Customer's contact. */
export type CurrentDelivery = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_address: string
  preparation_status: string | null
  accepted_at: string
  assigned_at: string
  assignment_source: "agent_claim" | "operator_assignment" | null
  /** The recorded pickup (#160), or null before collection. */
  picked_up_at: string | null
  /** The explicitly recorded arrival (#164), or null. */
  arrived_at: string | null
  /** The agent's recorded attempts to reach the Customer, oldest first (#164). */
  contact_attempts: { attempted_at: string }[]
  /** The route distance from pickup to the Customer (#191), or null. */
  trip_distance_km: number | null
  /**
   * Raised attention: pickup or handover still unconfirmed (#163), or no
   * handover ten minutes after arrival (#164). The operator was told at
   * `due_at`, an attention threshold rather than a promise. It changes
   * nothing the agent may do.
   */
  attention: {
    type:
      | "assigned_without_pickup"
      | "in_transit_without_delivery"
      | "arrived_without_handover"
    due_at: string
  } | null
  /**
   * What the agent may do now: pickup once the food is ready; then arrival,
   * then contact attempts, beside handover.
   */
  allowed_actions: (
    | "confirm_pickup"
    | "record_arrival"
    | "record_contact_attempt"
    | "confirm_handover"
  )[]
  customer: {
    name: string
    phone: string | null
    address_1: string
    address_2: string | null
    postal_code: string
    city: string
  }
}

export type ProblemReport = {
  id: string
  order_id: string
  category: ProblemCategory
  note: string | null
  reported_by: string
  reported_at: string
}

/** Sends one problem report; the backend owns responsibility and the first report. */
export async function reportDeliveryProblem(
  orderId: string,
  category: ProblemCategory,
  note: string,
): Promise<
  | { status: "reported" | "already_reported"; report: ProblemReport }
  | { status: "refused" | "uncertain" }
> {
  if (!orderId || note.length > 280) return { status: "refused" }
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!token) redirect("/delivery-sign-in")
  const correlationId = requestId((await headers()).get("x-request-id"))
  let response: Response
  try {
    response = await fetch(
      new URL(
        `/partner/deliveries/${encodeURIComponent(orderId)}/problem-report`,
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
        body: JSON.stringify({ category, note }),
      },
    )
  } catch {
    log("upstream.request.failed", {
      request_id: correlationId,
      route: "/partner/deliveries/:id/problem-report",
      method: "POST",
    })
    return { status: "uncertain" }
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as {
      code?: string
    } | null
    if (body?.code === "delivery_agent_access_revoked")
      redirect(AGENT_ACCESS_ENDED_PATH)
    return { status: "refused" }
  }
  if (response.status === 401) redirect("/delivery-sign-in")
  if (response.ok) {
    revalidatePath("/delivery", "layout")
    return response.json()
  }
  log("upstream.request.failed", {
    request_id: correlationId,
    route: "/partner/deliveries/:id/problem-report",
    method: "POST",
    status: response.status,
  })
  return { status: response.status >= 500 ? "uncertain" : "refused" }
}

/**
 * One of the agent's own ended deliveries (#161): reference, Restaurant,
 * milestone times and outcome, never the Customer's contact or address.
 */
export type CompletedDelivery = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_address: string
  accepted_at: string
  assigned_at: string | null
  assignment_source: "agent_claim" | "operator_assignment" | null
  picked_up_at: string | null
  ended_at: string
  outcome: "delivered" | "cancelled" | "failed"
}

export async function getCurrentDelivery(): Promise<CurrentDelivery | null> {
  const bearer = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) redirect("/delivery-sign-in")
  try {
    const result = await createPartnerSdk().client.fetch<{
      delivery: CurrentDelivery | null
    }>("/partner/delivery-agent/current", {
      headers: { authorization: `Bearer ${bearer}` },
      cache: "no-store",
    })
    return result.delivery
  } catch (error) {
    if (error instanceof FetchError && error.status === 403)
      redirect(AGENT_ACCESS_ENDED_PATH)
    if (error instanceof FetchError && error.status === 401)
      redirect("/delivery-sign-in")
    throw error
  }
}

export type ClaimResult =
  | { status: "claimed" }
  | { status: "refused"; code: DeliveryClaimErrorCode }
  /** No answer, or a server failure: the claim may or may not have committed. */
  | { status: "uncertain" }

const RETRY_IDENTITY = /^[A-Za-z0-9._:-]{1,100}$/

type AgentActionOutcome<Code> =
  | { status: "done" }
  | { status: "refused"; code: Code | "unknown_error" }
  | { status: "uncertain" }

/**
 * Sends one retry-identified Delivery agent action to the backend. The
 * backend takes the agent from the bearer; the browser names only the Order
 * and the retry identity, so a repeat after a lost response recovers the
 * original outcome. A missing or failed response is uncertain, never a
 * success or a refusal.
 */
async function postAgentAction<Code extends string>(action: {
  orderId: string
  retryIdentity: string
  /** The backend path for the Order. */
  path: (orderId: string) => string
  /** The route pattern, for logs without identifiers. */
  route: string
  /** The refusal codes this action has texts for. */
  isKnownCode: (code: unknown) => code is Code
}): Promise<AgentActionOutcome<Code | "delivery_not_found">> {
  const { orderId, retryIdentity, route } = action
  // A server action is a public endpoint: check what the browser sent.
  if (typeof orderId !== "string" || !RETRY_IDENTITY.test(retryIdentity))
    return { status: "refused", code: "unknown_error" }
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!token) redirect("/delivery-sign-in")
  const correlationId = requestId((await headers()).get("x-request-id"))
  let response: Response
  try {
    response = await fetch(new URL(action.path(orderId), BACKEND_URL), {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": correlationId,
      },
      body: JSON.stringify({ request_id: retryIdentity }),
    })
  } catch {
    log("upstream.request.failed", {
      request_id: correlationId,
      route,
      method: "POST",
    })
    return { status: "uncertain" }
  }
  revalidatePath("/delivery", "layout")
  if (response.status === 403) redirect(AGENT_ACCESS_ENDED_PATH)
  if (response.status === 401) redirect("/delivery-sign-in")
  if (response.ok) return { status: "done" }
  log("upstream.request.failed", {
    request_id: correlationId,
    route,
    method: "POST",
    status: response.status,
  })
  if (response.status >= 500) return { status: "uncertain" }
  if (response.status === 404)
    return { status: "refused", code: "delivery_not_found" }
  const body = (await response.json().catch(() => null)) as {
    code?: unknown
  } | null
  return {
    status: "refused",
    code: action.isKnownCode(body?.code) ? body.code : "unknown_error",
  }
}

/** Claims one available delivery (#157) with the card's retry identity. */
export async function claimDelivery(
  orderId: string,
  retryIdentity: string,
): Promise<ClaimResult> {
  const result = await postAgentAction({
    orderId,
    retryIdentity,
    path: (id) =>
      `/partner/delivery-agent/available/${encodeURIComponent(id)}/claim`,
    route: "/partner/delivery-agent/available/:id/claim",
    isKnownCode: isDeliveryClaimErrorCode,
  })
  return result.status === "done" ? { status: "claimed" } : result
}

export type PickupResult =
  | { status: "picked_up" }
  | { status: "refused"; code: DeliveryPickupErrorCode }
  /** No answer, or a server failure: pickup may or may not have been recorded. */
  | { status: "uncertain" }

/**
 * Confirms collecting the current delivery's ready food (#160). The server
 * records the time; a repeat with the same retry identity keeps it.
 */
export async function confirmPickup(
  orderId: string,
  retryIdentity: string,
): Promise<PickupResult> {
  const result = await postAgentAction({
    orderId,
    retryIdentity,
    path: (id) => `/partner/deliveries/${encodeURIComponent(id)}/pickup`,
    route: "/partner/deliveries/:id/pickup",
    isKnownCode: isDeliveryPickupErrorCode,
  })
  return result.status === "done" ? { status: "picked_up" } : result
}

/**
 * Reconciles an uncertain pickup from the authoritative current delivery:
 * picked up only if the server shows the milestone on this delivery.
 */
export async function checkPickup(
  orderId: string,
): Promise<"picked_up" | "not_picked_up" | "uncertain"> {
  try {
    const current = await getCurrentDelivery()
    revalidatePath("/delivery", "layout")
    return current?.order_id === orderId && current.picked_up_at
      ? "picked_up"
      : "not_picked_up"
  } catch (error) {
    unstable_rethrow(error)
    return "uncertain"
  }
}

export type ArrivalResult =
  | { status: "arrived" }
  | { status: "refused"; code: DeliveryArrivalErrorCode }
  /** No answer, or a server failure: arrival may or may not have been recorded. */
  | { status: "uncertain" }

/**
 * Records the agent's explicit arrival at the Customer (#164). The server
 * records the time; a repeat with the same retry identity keeps it. No
 * location is sent.
 */
export async function recordArrival(
  orderId: string,
  retryIdentity: string,
): Promise<ArrivalResult> {
  const result = await postAgentAction({
    orderId,
    retryIdentity,
    path: (id) => `/partner/deliveries/${encodeURIComponent(id)}/arrive`,
    route: "/partner/deliveries/:id/arrive",
    isKnownCode: isDeliveryArrivalErrorCode,
  })
  return result.status === "done" ? { status: "arrived" } : result
}

/**
 * Reconciles an uncertain arrival from the authoritative current delivery:
 * arrived only if the server shows the milestone on this delivery.
 */
export async function checkArrival(
  orderId: string,
): Promise<"arrived" | "not_arrived" | "uncertain"> {
  try {
    const current = await getCurrentDelivery()
    revalidatePath("/delivery", "layout")
    return current?.order_id === orderId && current.arrived_at
      ? "arrived"
      : "not_arrived"
  } catch (error) {
    unstable_rethrow(error)
    return "uncertain"
  }
}

export type ContactAttemptResult =
  | { status: "recorded" }
  | { status: "refused"; code: DeliveryContactAttemptErrorCode }
  /** No answer, or a server failure: the attempt may or may not have been recorded. */
  | { status: "uncertain" }

/**
 * Records one attempt to reach the Customer after arrival (#164). Each
 * attempt has its own retry identity; resending it after a lost response
 * keeps one attempt. It claims nothing about whether the Customer answered.
 */
export async function recordContactAttempt(
  orderId: string,
  retryIdentity: string,
): Promise<ContactAttemptResult> {
  const result = await postAgentAction({
    orderId,
    retryIdentity,
    path: (id) =>
      `/partner/deliveries/${encodeURIComponent(id)}/contact-attempts`,
    route: "/partner/deliveries/:id/contact-attempts",
    isKnownCode: isDeliveryContactAttemptErrorCode,
  })
  return result.status === "done" ? { status: "recorded" } : result
}

export type HandoverResult =
  | { status: "delivered" }
  | { status: "refused"; code: DeliveryHandoverErrorCode }
  /** No answer, or a server failure: handover may or may not have been recorded. */
  | { status: "uncertain" }

/**
 * Confirms actual handover of the current delivery (#161). The server
 * records the time and frees the agent for new work; a repeat with the same
 * retry identity keeps the original outcome.
 */
export async function confirmHandover(
  orderId: string,
  retryIdentity: string,
): Promise<HandoverResult> {
  const result = await postAgentAction({
    orderId,
    retryIdentity,
    path: (id) => `/partner/deliveries/${encodeURIComponent(id)}/deliver`,
    route: "/partner/deliveries/:id/deliver",
    isKnownCode: isDeliveryHandoverErrorCode,
  })
  return result.status === "done" ? { status: "delivered" } : result
}

/**
 * Reconciles an uncertain handover from the agent's own history: delivered
 * only if the server shows this delivery ended as delivered.
 */
export async function checkHandover(
  orderId: string,
): Promise<"delivered" | "not_delivered" | "uncertain"> {
  try {
    const entry = await getCompletedDelivery(orderId)
    revalidatePath("/delivery", "layout")
    return entry?.outcome === "delivered" ? "delivered" : "not_delivered"
  } catch (error) {
    unstable_rethrow(error)
    return "uncertain"
  }
}

/**
 * Reconciles an uncertain claim from the authoritative current delivery:
 * claimed only if the server says this agent is responsible for it.
 */
export async function checkDeliveryClaim(
  orderId: string,
): Promise<"claimed" | "not_claimed" | "uncertain"> {
  try {
    const current = await getCurrentDelivery()
    revalidatePath("/delivery", "layout")
    return current?.order_id === orderId ? "claimed" : "not_claimed"
  } catch (error) {
    // `redirect` signals by throwing; let a signed-out session leave.
    unstable_rethrow(error)
    return "uncertain"
  }
}

export type PickupDistances =
  | { status: "measured"; distances: Record<string, number | null> }
  /** No answer: distances are simply not shown. */
  | { status: "unavailable" }

const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Distances from the agent's position to the listed pickups (#191), only
 * while the agent shares their location. The position goes straight to the
 * backend in the request body and is never stored, logged or put in a URL
 * here. The backend answers only for deliveries in the agent's own view.
 */
export async function measurePickupDistances(
  position: { latitude: number; longitude: number },
  orderIds: string[],
): Promise<PickupDistances> {
  const { latitude, longitude } = position ?? {}
  // A server action is a public endpoint: check what the browser sent.
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Array.isArray(orderIds) ||
    !orderIds.length ||
    orderIds.length > 25 ||
    !orderIds.every((id) => typeof id === "string" && ORDER_ID.test(id))
  )
    return { status: "unavailable" }
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!token) redirect("/delivery-sign-in")
  const correlationId = requestId((await headers()).get("x-request-id"))
  const route = "/partner/delivery-agent/pickup-distances"
  let response: Response
  try {
    response = await fetch(new URL(route, BACKEND_URL), {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": correlationId,
      },
      body: JSON.stringify({ latitude, longitude, order_ids: orderIds }),
    })
  } catch {
    log("upstream.request.failed", {
      request_id: correlationId,
      route,
      method: "POST",
    })
    return { status: "unavailable" }
  }
  if (response.status === 403) redirect(AGENT_ACCESS_ENDED_PATH)
  if (response.status === 401) redirect("/delivery-sign-in")
  if (!response.ok) {
    log("upstream.request.failed", {
      request_id: correlationId,
      route,
      method: "POST",
      status: response.status,
    })
    return { status: "unavailable" }
  }
  const body = (await response.json().catch(() => null)) as {
    distances?: { order_id: string; distance_km: number | null }[]
  } | null
  if (!Array.isArray(body?.distances)) return { status: "unavailable" }
  return {
    status: "measured",
    distances: Object.fromEntries(
      body.distances.map(({ order_id, distance_km }) => [
        order_id,
        distance_km,
      ]),
    ),
  }
}

/**
 * What became of one shared position (#166): `shared` with the observation
 * the backend keeps (unchanged when it coalesced this one), `ended` when the
 * delivery is no longer the agent's active, collected work, `refused` for a
 * sample the backend would not keep, `unavailable` when it was not reached.
 */
export type LocationShareResult =
  | { status: "shared"; observed_at: string | null }
  | { status: "ended" | "refused" | "unavailable" }

/**
 * Refusals meaning the delivery is no longer the agent's collected, active
 * work. `pickup_not_recorded` belongs here too: transit sharing starts only
 * after pickup, so the screen it was sent from is out of date.
 */
const ENDED_LOCATION_CODES = new Set([
  "delivery_not_active",
  "pickup_not_recorded",
])

/**
 * Sends the phone's latest position for the agent's collected delivery
 * (#166). The coordinate goes only in the request body: never stored,
 * logged or put in a URL here. A revoked agent is signed out.
 */
export async function shareDeliveryLocation(
  orderId: string,
  sample: {
    latitude: number
    longitude: number
    accuracy_m: number | null
    observed_at: number
  },
): Promise<LocationShareResult> {
  const { latitude, longitude, accuracy_m, observed_at } = sample ?? {}
  // A server action is a public endpoint: check what the browser sent.
  if (
    typeof orderId !== "string" ||
    !ORDER_ID.test(orderId) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(observed_at) ||
    (accuracy_m !== null && !Number.isFinite(accuracy_m))
  )
    return { status: "refused" }
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!token) redirect("/delivery-sign-in")
  const correlationId = requestId((await headers()).get("x-request-id"))
  const logFailure = (status?: number) =>
    log("upstream.request.failed", {
      request_id: correlationId,
      route: "/partner/deliveries/:id/location",
      method: "POST",
      ...(status === undefined ? {} : { status }),
    })
  let response: Response
  try {
    response = await fetch(
      new URL(
        `/partner/deliveries/${encodeURIComponent(orderId)}/location`,
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
        body: JSON.stringify({
          latitude,
          longitude,
          // The backend alone decides which accuracy and age it accepts.
          accuracy_m,
          observed_at: new Date(observed_at).toISOString(),
        }),
      },
    )
  } catch {
    logFailure()
    return { status: "unavailable" }
  }
  if (response.status === 403) redirect(AGENT_ACCESS_ENDED_PATH)
  if (response.status === 401) redirect("/delivery-sign-in")
  const body = (await response.json().catch(() => null)) as {
    code?: string
    location?: { observed_at?: string | null }
  } | null
  if (response.ok)
    return {
      status: "shared",
      observed_at: body?.location?.observed_at ?? null,
    }
  // Another agent's or no delivery answers 404, like a missing Order.
  if (
    response.status === 404 ||
    (body?.code && ENDED_LOCATION_CODES.has(body.code))
  )
    return { status: "ended" }
  if (response.status >= 500) {
    logFailure(response.status)
    return { status: "unavailable" }
  }
  return { status: "refused" }
}

export async function getAvailableDeliveries(
  postalCodes: string[],
  offset: number,
) {
  const bearer = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) redirect("/delivery-sign-in")
  const query = new URLSearchParams({
    limit: "20",
    offset: String(offset),
    postal_codes: postalCodes.join(","),
  })
  return createPartnerSdk().client.fetch<{
    deliveries: AvailableDelivery[]
    has_more: boolean
    server_time: string
  }>(`/partner/delivery-agent/available?${query}`, {
    headers: { authorization: `Bearer ${bearer}` },
    cache: "no-store",
  })
}

export async function getAvailableDelivery(orderId: string) {
  const bearer = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) redirect("/delivery-sign-in")
  try {
    return await createPartnerSdk().client.fetch<{
      delivery: AvailableDelivery
      server_time: string
    }>(`/partner/delivery-agent/available/${encodeURIComponent(orderId)}`, {
      headers: { authorization: `Bearer ${bearer}` },
      cache: "no-store",
    })
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) return null
    throw error
  }
}

/** One page of the agent's own completed deliveries, newest first. */
export async function getCompletedDeliveries(offset: number, limit = 20) {
  const bearer = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) redirect("/delivery-sign-in")
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  try {
    return await createPartnerSdk().client.fetch<{
      deliveries: CompletedDelivery[]
      has_more: boolean
    }>(`/partner/delivery-agent/history?${query}`, {
      headers: { authorization: `Bearer ${bearer}` },
      cache: "no-store",
    })
  } catch (error) {
    if (error instanceof FetchError && error.status === 403)
      redirect(AGENT_ACCESS_ENDED_PATH)
    if (error instanceof FetchError && error.status === 401)
      redirect("/delivery-sign-in")
    throw error
  }
}

/** One of the agent's own completed deliveries, or null if it is not one. */
export async function getCompletedDelivery(
  orderId: string,
): Promise<CompletedDelivery | null> {
  const bearer = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) redirect("/delivery-sign-in")
  try {
    const result = await createPartnerSdk().client.fetch<{
      delivery: CompletedDelivery
    }>(`/partner/delivery-agent/history/${encodeURIComponent(orderId)}`, {
      headers: { authorization: `Bearer ${bearer}` },
      cache: "no-store",
    })
    return result.delivery
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) return null
    if (error instanceof FetchError && error.status === 403)
      redirect(AGENT_ACCESS_ENDED_PATH)
    if (error instanceof FetchError && error.status === 401)
      redirect("/delivery-sign-in")
    throw error
  }
}

export async function getDeliveryInvitation(
  token?: string,
): Promise<Invite | null> {
  if (!token) return null
  try {
    const result = await createPartnerSdk().client.fetch<{
      invitation: Invite
    }>("/partner/delivery-agent-invitations/open", {
      method: "POST",
      body: { token },
    })
    return result.invitation
  } catch (error) {
    if (
      error instanceof FetchError &&
      (error.status === 400 || error.status === 404)
    )
      return null
    throw error
  }
}

type AgentRead =
  | { status: "authorized"; agent: CurrentAgent }
  /** The backend refused a valid token: access was revoked. */
  | { status: "ended" }
  | { status: "signed_out" }

async function readDeliveryAgent(token?: string): Promise<AgentRead> {
  const bearer = token ?? (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) return { status: "signed_out" }
  try {
    return {
      status: "authorized",
      agent: await createPartnerSdk().client.fetch<CurrentAgent>(
        "/partner/delivery-agent/me",
        { headers: { authorization: `Bearer ${bearer}` }, cache: "no-store" },
      ),
    }
  } catch (error) {
    if (error instanceof FetchError && error.status === 403)
      return { status: "ended" }
    if (error instanceof FetchError && error.status === 401)
      return { status: "signed_out" }
    throw error
  }
}

export async function getDeliveryAgent(
  token?: string,
): Promise<CurrentAgent | null> {
  const read = await readDeliveryAgent(token)
  return read.status === "authorized" ? read.agent : null
}

/** The signed-in agent, or a redirect to sign-in (with the ended-access notice). */
export async function requireDeliveryAgent(): Promise<CurrentAgent> {
  const read = await readDeliveryAgent()
  if (read.status === "authorized") return read.agent
  redirect(
    read.status === "ended" ? AGENT_ACCESS_ENDED_PATH : "/delivery-sign-in",
  )
}

export async function signInDeliveryAgent(
  _previous: AgentActionState,
  form: FormData,
): Promise<AgentActionState> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  try {
    const token = await createPartnerSdk().auth.login(
      "delivery_agent",
      "delivery-agent-emailpass",
      { email, password },
    )
    if (typeof token !== "string") return { error: "failed" }
    // The password was right; a revoked agent is told access ended (#159).
    const read = await readDeliveryAgent(token)
    if (read.status === "ended") return { error: "ended" }
    if (read.status !== "authorized") return { error: "failed" }
    await storePartnerToken(token)
  } catch (error) {
    if (error instanceof FetchError && error.status === 401)
      return { error: "wrong_credentials" }
    return { error: "failed" }
  }
  redirect("/delivery")
}

export async function acceptDeliveryInvitation(
  _previous: AgentActionState,
  form: FormData,
): Promise<AgentActionState> {
  const invitationToken = String(form.get("token") ?? "")
  const password = String(form.get("password") ?? "")
  if (password.length < MIN_PASSWORD_LENGTH) return { error: "failed" }
  try {
    const invitation = await getDeliveryInvitation(invitationToken)
    if (!invitation) return { error: "invalid" }
    const sdk = createPartnerSdk()
    let registration: string
    try {
      registration = await sdk.auth.register(
        "delivery_agent",
        "delivery-agent-emailpass",
        {
          email: invitation.email,
          password,
          invitation_token: invitationToken,
        },
      )
    } catch (error) {
      if (!(error instanceof FetchError && error.status === 401)) throw error
      const login = await sdk.auth.login(
        "delivery_agent",
        "delivery-agent-emailpass",
        { email: invitation.email, password },
      )
      if (typeof login !== "string") return { error: "failed" }
      registration = login
    }
    await sdk.client.fetch("/partner/delivery-agent-invitations/accept", {
      method: "POST",
      body: { token: invitationToken },
      headers: { authorization: `Bearer ${registration}` },
    })
    const token = await sdk.auth.login(
      "delivery_agent",
      "delivery-agent-emailpass",
      { email: invitation.email, password },
    )
    if (typeof token !== "string" || !(await getDeliveryAgent(token)))
      return { error: "failed" }
    await storePartnerToken(token)
  } catch (error) {
    return {
      error:
        error instanceof FetchError && error.status === 400
          ? "invalid"
          : "failed",
    }
  }
  redirect("/delivery")
}

export async function signOutDeliveryAgent() {
  const jar = await cookies()
  jar.delete(PARTNER_TOKEN_COOKIE)
  redirect("/delivery-sign-in?message=signed_out")
}

export async function saveDeliveryFilter(form: FormData) {
  const agent = await getDeliveryAgent()
  if (!agent) redirect("/delivery-sign-in")
  const approved = new Set(agent.postal_codes)
  // A town's checkbox carries its codes, comma-separated; only approved
  // codes are kept, so the filter can never widen the agent's areas.
  const selected = form
    .getAll("postal_codes")
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .filter((code) => approved.has(code))
  const bitmap = Buffer.alloc(1250)
  for (const code of selected) {
    const number = Number(code)
    bitmap[Math.floor(number / 8)] |= 1 << (number % 8)
  }
  ;(await cookies()).set(
    FILTER_COOKIE,
    `${agent.agent.id}.${bitmap.toString("base64url")}`,
    cookieOptions(60 * 60 * 24 * 365),
  )
  redirect("/delivery")
}

export async function getDeliveryFilter(agentId: string, approved: string[]) {
  const raw = (await cookies()).get(FILTER_COOKIE)?.value
  if (!raw) return approved
  try {
    const [owner, encoded] = raw.split(".")
    if (owner !== agentId || !encoded) return approved
    const bitmap = Buffer.from(encoded, "base64url")
    if (bitmap.length !== 1250) return approved
    return approved.filter((code) => {
      const number = Number(code)
      return (bitmap[Math.floor(number / 8)] & (1 << (number % 8))) !== 0
    })
  } catch {
    return approved
  }
}
