import { endedCodeOfFailure } from "./order-feed-relay.ts"
import type { FeedEndedCode } from "../session-ended.ts"

/**
 * The Delivery agent feed's polling check (#165), free of Next.js and the
 * SDK so its behavior is tested directly. The stream itself is relayed by
 * the kitchen feed's `relayFeed`, which is route-agnostic.
 */

/** The polling check's answer; `ended` names why the session ended. */
export type DeliveryCheck =
  | { status: "ok" }
  | { status: "ended"; code: FeedEndedCode }
  | { status: "unavailable" }

/**
 * Asks whether the agent's authorized current-delivery read works right now.
 * A success proves the same path the workspace then rereads through, so a
 * server render while the backend is down never replaces the screen.
 */
export async function checkDeliveryWith({
  token,
  readCurrent,
  onFailure,
}: {
  token: string | undefined
  readCurrent: (token: string) => Promise<unknown>
  onFailure: (error: unknown) => void
}): Promise<DeliveryCheck> {
  if (!token) return { status: "ended", code: "signed_out" }
  try {
    await readCurrent(token)
    return { status: "ok" }
  } catch (error) {
    const code = endedCodeOfFailure(error)
    if (code) return { status: "ended", code }
    onFailure(error)
    return { status: "unavailable" }
  }
}
