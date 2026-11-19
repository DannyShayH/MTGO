/**
 * The kitchen screen's arrival alert rules (#149), kept free of React and the
 * browser so they can be tested. Every reread of the awaiting queue, whether
 * a feed hint, a reconnect or a poll caused it, passes through here.
 */
import type {
  AwaitingOrder,
  AwaitingRead,
} from "../../lib/data/order-feed-relay.ts"

export type { AwaitingOrder, AwaitingRead }

export type ArrivalState = {
  /** Every awaiting Order id this tab has seen; null before the first read. */
  known: ReadonlySet<string> | null
  /**
   * The backend's time at the first read. An Order placed earlier was
   * already waiting, even if it was beyond that read's first page.
   */
  since: number | null
  /** Arrivals shown to staff and not yet dismissed, oldest first. */
  pending: AwaitingOrder[]
}

export const INITIAL_ARRIVALS: ArrivalState = {
  known: null,
  since: null,
  pending: [],
}

/** Placed after the screen's first read, on the backend's clock. */
const isPlacedSince = ({ placed_at }: AwaitingOrder, since: number) =>
  placed_at !== null && Date.parse(placed_at) >= since

export function noticeArrivals(
  state: ArrivalState,
  read: AwaitingRead,
): { state: ArrivalState; arrivals: AwaitingOrder[] } {
  const known = new Set(state.known)
  const since = state.since ?? Date.parse(read.server_time)
  const arrivals: AwaitingOrder[] = []
  for (const order of read.orders) {
    if (state.known && !known.has(order.id) && isPlacedSince(order, since))
      arrivals.push(order)
    known.add(order.id)
  }
  // Only a read of the whole queue proves an Order stopped awaiting.
  const awaiting = new Set(read.orders.map(({ id }) => id))
  const isComplete = read.orders.length >= read.count
  const stillAwaiting = state.pending.filter(
    ({ id }) => !isComplete || awaiting.has(id),
  )
  return {
    state: { known, since, pending: [...stillAwaiting, ...arrivals] },
    arrivals,
  }
}

/**
 * Staff saw the alert. Only the alert goes: the Orders stay known, so a
 * replay never alerts again, and the Orders themselves are not accepted.
 */
export const dismissArrivals = (state: ArrivalState): ArrivalState => ({
  ...state,
  pending: [],
})

/** The banner names at most this many Orders, so many arrivals stay one line. */
export const NAMED_ARRIVALS = 3

/** The oldest arrivals the banner names, and how many more there are. */
export const namedArrivals = (pending: AwaitingOrder[]) => ({
  named: pending.slice(0, NAMED_ARRIVALS),
  more: Math.max(0, pending.length - NAMED_ARRIVALS),
})
