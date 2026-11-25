/** A rolling interval, inclusive of its start and exclusive of its end. */
export function lastThirtyDays(now: Date) {
  return {
    key: "last_30_days" as const,
    from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    to: now,
  }
}
