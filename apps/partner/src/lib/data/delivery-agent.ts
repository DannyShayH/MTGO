"use server"

import { cookies, headers } from "next/headers"
import { redirect, unstable_rethrow } from "next/navigation"
import { revalidatePath } from "next/cache"
import { FetchError } from "@medusajs/js-sdk"
import { requestId } from "@dtc/logging"
import {
  isDeliveryClaimErrorCode,
  type DeliveryClaimErrorCode,
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
type CurrentAgent = {
  agent: { id: string; name: string }
  postal_codes: string[]
  /** The approved codes with their register town names. */
  areas: { postal_code: string; name: string | null }[]
}
type Invite = { id: string; name: string; email: string }
export type AgentActionState = { error?: "failed" | "invalid" }
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
  customer: {
    name: string
    phone: string | null
    address_1: string
    address_2: string | null
    postal_code: string
    city: string
  }
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
    if (
      error instanceof FetchError &&
      (error.status === 401 || error.status === 403)
    )
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

/**
 * Claims one available delivery (#157). The backend takes the agent from the
 * bearer; the browser names only the Order and the retry identity it keeps
 * for this card, so a repeat after a lost response recovers the original
 * claim. A missing or failed response is reported as uncertain, never as a
 * success or a refusal.
 */
export async function claimDelivery(
  orderId: string,
  retryIdentity: string,
): Promise<ClaimResult> {
  // A server action is a public endpoint: check what the browser sent.
  if (typeof orderId !== "string" || !RETRY_IDENTITY.test(retryIdentity))
    return { status: "refused", code: "unknown_error" }
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!token) redirect("/delivery-sign-in")
  const correlationId = requestId((await headers()).get("x-request-id"))
  const route = "/partner/delivery-agent/available/:id/claim"
  let response: Response
  try {
    response = await fetch(
      new URL(
        `/partner/delivery-agent/available/${encodeURIComponent(orderId)}/claim`,
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
        body: JSON.stringify({ request_id: retryIdentity }),
      },
    )
  } catch {
    log("upstream.request.failed", {
      request_id: correlationId,
      route,
      method: "POST",
    })
    return { status: "uncertain" }
  }
  revalidatePath("/delivery", "layout")
  if (response.status === 401 || response.status === 403)
    redirect("/delivery-sign-in")
  if (response.ok) return { status: "claimed" }
  log("upstream.request.failed", {
    request_id: correlationId,
    route,
    method: "POST",
    status: response.status,
  })
  if (response.status >= 500) return { status: "uncertain" }
  const body = (await response.json().catch(() => null)) as {
    code?: unknown
  } | null
  const code = response.status === 404 ? "delivery_not_found" : body?.code
  return {
    status: "refused",
    code: isDeliveryClaimErrorCode(code) ? code : "unknown_error",
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

export async function getDeliveryAgent(
  token?: string,
): Promise<CurrentAgent | null> {
  const bearer = token ?? (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  if (!bearer) return null
  try {
    return await createPartnerSdk().client.fetch<CurrentAgent>(
      "/partner/delivery-agent/me",
      { headers: { authorization: `Bearer ${bearer}` }, cache: "no-store" },
    )
  } catch (error) {
    if (
      error instanceof FetchError &&
      (error.status === 401 || error.status === 403)
    )
      return null
    throw error
  }
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
    if (typeof token !== "string" || !(await getDeliveryAgent(token)))
      return { error: "failed" }
    await storePartnerToken(token)
  } catch {
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
  redirect("/delivery-sign-in")
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
