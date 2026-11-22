import { createHash } from "node:crypto"

/**
 * The Delivery agent feed (#165) streams only that something changed, never
 * what. Each connection remembers a fingerprint of the two projections the
 * phone shows, and a changed fingerprint becomes an invalidation hint: the
 * phone then rereads through the authorized contracts. A hint is never a
 * claim, a milestone or a location observation.
 */
export const DELIVERY_FEED_SCOPES = ["available", "current"] as const
export type DeliveryFeedScope = (typeof DELIVERY_FEED_SCOPES)[number]

/** One fingerprint per projection; a plain object, so it passes through workflow input. */
export type DeliveryFeedState = Readonly<Record<DeliveryFeedScope, string>>

/** A short stable digest of durable facts, so the stream carries none of them. */
export function fingerprintOf(facts: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(facts))
    .digest("hex")
    .slice(0, 16)
}

/**
 * Compares one read with what this connection already announced. Only a
 * changed projection becomes a hint, so rereading never repeats one.
 */
export function advanceDeliveryFeed(
  announced: DeliveryFeedState,
  read: DeliveryFeedState,
): { announced: DeliveryFeedState; scopes: DeliveryFeedScope[] } {
  return {
    announced: read,
    scopes: DELIVERY_FEED_SCOPES.filter(
      (scope) => announced[scope] !== read[scope],
    ),
  }
}
