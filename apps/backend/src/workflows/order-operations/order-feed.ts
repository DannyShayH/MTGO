/**
 * The kitchen feed (#148) rereads the Orders whose operational record changed
 * within this window on every tick. A change whose transaction commits after
 * a newer one still falls inside it, and no cursor can skip a timestamp tie.
 */
export const ORDER_FEED_WINDOW_MS = 30_000

/** At most this many changed records are read per tick (a bounded read). */
export const ORDER_FEED_READ_LIMIT = 200

/**
 * One durable fact the feed compares, and the hint it streams to staff: an
 * Order's id and operational revision, with no Order details.
 */
export type OrderRevision = { id: string; revision: number }

/**
 * The newest revision of each Order one connection already announced, by
 * Order id. A plain object, so it passes through workflow input as it is.
 */
export type AnnouncedRevisions = Readonly<Record<string, number>>

export const orderFeedWindowStart = (now: Date) =>
  new Date(now.getTime() - ORDER_FEED_WINDOW_MS)

/**
 * Compares one windowed read with the revisions already announced on this
 * connection. Only a newer revision is announced, so rereading the window
 * never repeats a hint. Orders that left the window are forgotten: they come
 * back only with a new revision, which must be announced anyway.
 */
export function advanceOrderFeed(
  announced: AnnouncedRevisions,
  read: OrderRevision[],
): { announced: AnnouncedRevisions; hints: OrderRevision[] } {
  const next: Record<string, number> = {}
  const hints: OrderRevision[] = []
  for (const { id, revision } of read) {
    const known = Math.max(announced[id] ?? 0, next[id] ?? 0)
    if (revision > known) hints.push({ id, revision })
    next[id] = Math.max(known, revision)
  }
  return { announced: next, hints }
}
