import "server-only"
import { FetchError } from "@medusajs/js-sdk"
import { sdk } from "@lib/config"

export type OpenedInvitation = {
  restaurant: { name: string }
  staff: { name: string; email: string }
}

/**
 * Reads an invitation by its token. Every unusable link (expired, used,
 * cancelled or unknown) answers 400 `invitation_invalid`, so the page shows
 * one message without revealing which case applies.
 */
export async function retrieveInvitation(
  token: string | undefined,
): Promise<OpenedInvitation | null> {
  if (!token) return null
  try {
    const { invitation } = await sdk.client.fetch<{
      invitation: OpenedInvitation
    }>(`/partner/staff-invitations/${encodeURIComponent(token)}`)
    return invitation
  } catch (error) {
    if (
      error instanceof FetchError &&
      (error.status === 400 || error.status === 404)
    )
      return null
    throw error
  }
}
