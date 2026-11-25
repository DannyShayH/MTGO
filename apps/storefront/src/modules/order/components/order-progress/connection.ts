/**
 * The Customer tracking page's connection rules (#215), free of React and the
 * browser so every transition is tested. The page runs the one effect,
 * `shouldReread`: read the authorized tracking projection again. Checking every ten
 * seconds runs exactly while the status is `checking`.
 *
 * `live` is claimed only after the feed is ready, a reread that started after
 * `ready` succeeded, and the feed showed activity (a heartbeat or a hint).
 * Opening a connection alone proves nothing. A detected failure switches to
 * `checking` at once, and so does a failed read while the feed is open: the
 * page is then not current, so it checks until a later read succeeds and the
 * feed is active again. The connection says nothing about GPS freshness.
 */
export type TrackingConnectionStatus = "connecting" | "live" | "checking"

export type TrackingConnection = {
  status: TrackingConnectionStatus
  /**
   * While an open feed is proving itself: the first read that counts as its
   * reconciliation, and whether that read and feed activity have happened.
   * Null when no ready feed is open.
   */
  proving: {
    fromRead: number
    isReconciled: boolean
    hasActivity: boolean
  } | null
}

export type TrackingConnectionEvent =
  /** `nextRead` is the number the page will give its next read. */
  | { type: "stream_ready"; nextRead: number }
  | { type: "heartbeat" }
  | { type: "tracking_hinted" }
  | { type: "stream_failed" }
  /** Read number `read` of the tracking projection succeeded. */
  | { type: "read_succeeded"; read: number }
  /** Read number `read` failed (not a refusal: that ends tracking). */
  | { type: "read_failed"; read: number }
  | { type: "reconcile_due" }

export const INITIAL_TRACKING_CONNECTION: TrackingConnection = {
  status: "connecting",
  proving: null,
}

/** A live page still rereads this often, to recover a missed hint. */
export const RECONCILE_MS = 60_000

type Transition = { state: TrackingConnection; shouldReread: boolean }

/** A proving feed that is reconciled and active becomes live. */
const settle = (
  state: TrackingConnection,
  shouldReread: boolean,
): Transition => {
  const { proving } = state
  if (proving?.isReconciled && proving.hasActivity)
    return { state: { status: "live", proving: null }, shouldReread }
  return { state, shouldReread }
}

const withActivity = (state: TrackingConnection): TrackingConnection =>
  state.proving
    ? { ...state, proving: { ...state.proving, hasActivity: true } }
    : state

export function nextTrackingConnection(
  state: TrackingConnection,
  event: TrackingConnectionEvent,
): Transition {
  switch (event.type) {
    case "stream_ready":
      return {
        state: {
          // Checking continues until the reopened feed proves itself.
          status: state.status === "live" ? "connecting" : state.status,
          proving: {
            fromRead: event.nextRead,
            isReconciled: false,
            hasActivity: false,
          },
        },
        shouldReread: true,
      }
    case "heartbeat":
      return settle(withActivity(state), false)
    case "tracking_hinted":
      return settle(withActivity(state), true)
    case "read_succeeded":
      if (!state.proving || event.read < state.proving.fromRead)
        return { state, shouldReread: false }
      return settle(
        { ...state, proving: { ...state.proving, isReconciled: true } },
        false,
      )
    case "read_failed": {
      // With the feed open but the page not current, check every ten
      // seconds; a later read and feed activity make it live again.
      const isFeedOpen = state.status === "live" || state.proving !== null
      if (!isFeedOpen) return { state, shouldReread: false }
      return {
        state: {
          status: "checking",
          proving: {
            fromRead: Math.max(event.read + 1, state.proving?.fromRead ?? 0),
            isReconciled: false,
            hasActivity: false,
          },
        },
        shouldReread: false,
      }
    }
    case "stream_failed":
      return {
        state: { status: "checking", proving: null },
        shouldReread: true,
      }
    case "reconcile_due":
      return { state, shouldReread: state.status === "live" }
  }
}
