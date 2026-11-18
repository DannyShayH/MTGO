"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FetchError } from "@medusajs/js-sdk"
import { createPartnerSdk, PARTNER_TOKEN_COOKIE } from "@lib/config"
import { cookieOptions, storePartnerToken } from "@lib/partner-token"
import { MIN_PASSWORD_LENGTH } from "@lib/password"

const FILTER_COOKIE = "mtogo_delivery_area_filter"
type CurrentAgent = {
  agent: { id: string; name: string }
  postal_codes: string[]
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
  const selected = form
    .getAll("postal_codes")
    .filter(
      (value): value is string =>
        typeof value === "string" && approved.has(value),
    )
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
