import "server-only"
import { cache } from "react"
import { FetchError } from "@medusajs/js-sdk"
import { createPartnerSdk } from "@lib/config"

export type CurrentAgent = {
  agent: { id: string; name: string }
  postal_codes: string[]
  /** The approved codes with their register town names. */
  areas: { postal_code: string; name: string | null }[]
  /** Backend-owned Features the workspace shows navigation for (ADR-0022). */
  features?: { agent_bonus?: boolean }
}

export type AgentRead =
  | { status: "authorized"; agent: CurrentAgent }
  /** The backend refused a valid token: access was revoked. */
  | { status: "ended" }
  | { status: "signed_out" }

/**
 * One `/partner/delivery-agent/me` read per token and request (#253). Keyed
 * by the token itself, so a sign-in or sign-out in the same request never
 * reuses another session's answer.
 */
export const readAgentWithToken = cache(
  async (bearer: string): Promise<AgentRead> => {
    try {
      return {
        status: "authorized",
        agent: await createPartnerSdk().client.fetch<CurrentAgent>(
          "/partner/delivery-agent/me",
          {
            headers: { authorization: `Bearer ${bearer}` },
            cache: "no-store",
          },
        ),
      }
    } catch (error) {
      if (error instanceof FetchError && error.status === 403)
        return { status: "ended" }
      if (error instanceof FetchError && error.status === 401)
        return { status: "signed_out" }
      throw error
    }
  },
)
