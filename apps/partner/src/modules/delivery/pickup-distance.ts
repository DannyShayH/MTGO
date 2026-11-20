import type { Locale } from "@dtc/i18n"

export type Position = { latitude: number; longitude: number }

/** Resend an unchanged position at most this often while sharing is on. */
export const RESEND_AFTER_MS = 60_000
/** Or sooner, once the agent has moved this far. */
const RESEND_AFTER_METERS = 200

/** "≈ 3,2 km" or "≈ 3.2 km"; null when there is no distance to show. */
export function formatDistance(
  km: number | null | undefined,
  locale: Locale,
): string | null {
  if (km === null || km === undefined) return null
  const value = new Intl.NumberFormat(locale === "da" ? "da-DK" : "en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(km)
  return `≈ ${value} km`
}

/**
 * Nearest pickup first; deliveries without a distance keep their
 * oldest-first order after the measured ones. Returns a new list.
 */
export function sortByNearest<T extends { order_id: string }>(
  items: readonly T[],
  distances: Record<string, number | null | undefined>,
): T[] {
  const rank = (item: T) => distances[item.order_id] ?? Infinity
  // Array.prototype.sort is stable, so equal distances stay oldest first.
  return [...items].sort((a, b) => rank(a) - rank(b))
}

/** Great-circle distance in meters, only to decide when to resend. */
function metersBetween(a: Position, b: Position) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = radians(b.latitude - a.latitude)
  const dLon = radians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * Whether a new position is worth sending: the first one, after moving
 * 200 m, or after a minute. Keeps provider calls well inside the free quota.
 */
export function shouldSendPosition(
  last: { position: Position; at: number } | null,
  next: Position,
  now: number,
) {
  if (!last) return true
  return (
    now - last.at >= RESEND_AFTER_MS ||
    metersBetween(last.position, next) >= RESEND_AFTER_METERS
  )
}
