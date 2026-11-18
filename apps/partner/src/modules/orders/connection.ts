/**
 * The kitchen screen's connection rules (#148), kept free of React and the
 * browser so every transition can be tested. The screen runs the effects:
 * reload means "read fresh Orders through the authorized contracts".
 */
export type ConnectionStatus =
  "connecting" | "live" | "reconnecting" | "fallback" | "offline"

export type ConnectionState = {
  status: ConnectionStatus
  /**
   * The feed sent `ready` but has not yet proven it works (a heartbeat or a
   * hint after `ready`), so the screen does not claim "live" yet.
   */
  isStreamUnproven: boolean
  /**
   * Consecutive feed failures since it last proved it works, so a feed that
   * opens and drops at once still backs off and falls back instead of
   * reconnecting every second.
   */
  streamFailures: number
  /** Consecutive failed polls since one last succeeded. */
  pollFailures: number
}

export type ConnectionEvent =
  | "stream_ready"
  | "heartbeat_received"
  | "orders_hinted"
  | "stream_failed"
  | "heartbeat_missed"
  | "poll_succeeded"
  | "poll_failed"
  /** The check before a reload failed (the backend's Orders read is down). */
  | "reload_failed"
  | "focused"
  | "refresh_requested"
  | "reconcile_due"

export type ConnectionEffects = {
  reload?: true
  openStreamInMs?: number
  pollInMs?: number
  stopPolling?: true
}

type Transition = { state: ConnectionState; effects: ConnectionEffects }

export const INITIAL_CONNECTION: ConnectionState = {
  status: "connecting",
  isStreamUnproven: false,
  streamFailures: 0,
  pollFailures: 0,
}

/** The feed is retried this often before the screen falls back to polling. */
const STREAM_ATTEMPTS = 3
const STREAM_RETRY_MS = 1000
/** While polling, streaming is tried again this often to restore it. */
const STREAM_RESTORE_MS = 60_000
/** Polling while streaming is unavailable but HTTP works; the status text says it. */
export const POLL_MS = 15_000
const POLL_RETRY_MS = 5000
const POLL_RETRY_MAX_MS = 60_000
/** A live screen still rereads everything this often (missed hints). */
export const RECONCILE_MS = 60_000
/** A live feed sends a heartbeat every 15 s; silence beyond this is a failure. */
export const HEARTBEAT_TIMEOUT_MS = 40_000

/** The wait before retry number `failures` (from 1): doubling, capped. */
export const backoffMs = (baseMs: number, failures: number, maxMs: number) =>
  Math.min(baseMs * 2 ** (failures - 1), maxMs)

const isPolling = (status: ConnectionStatus) =>
  status === "fallback" || status === "offline"

const PROVEN: Pick<ConnectionState, "streamFailures" | "pollFailures"> = {
  streamFailures: 0,
  pollFailures: 0,
}

const unchanged = (state: ConnectionState): Transition => ({
  state,
  effects: {},
})

/**
 * Try the transports that are down right now; `ready` or a poll then
 * reloads. A feed that is open but not yet proven is left to finish.
 */
const retryNow = (state: ConnectionState): ConnectionEffects => ({
  ...(isPolling(state.status) && { pollInMs: 0 }),
  ...(!state.isStreamUnproven && { openStreamInMs: 0 }),
})

function streamFailed(state: ConnectionState): Transition {
  const streamFailures = state.streamFailures + 1
  const failed = { ...state, isStreamUnproven: false, streamFailures }
  if (isPolling(state.status))
    return { state: failed, effects: { openStreamInMs: STREAM_RESTORE_MS } }
  const status = state.status === "connecting" ? "connecting" : "reconnecting"
  if (streamFailures < STREAM_ATTEMPTS)
    return {
      state: { ...failed, status },
      effects: {
        openStreamInMs: backoffMs(
          STREAM_RETRY_MS,
          streamFailures,
          STREAM_RESTORE_MS,
        ),
      },
    }
  return {
    state: { ...failed, status },
    effects: { pollInMs: 0, openStreamInMs: STREAM_RESTORE_MS },
  }
}

function pollFailed(state: ConnectionState): Transition {
  const pollFailures = state.pollFailures + 1
  return {
    state: { ...state, status: "offline", pollFailures },
    effects: {
      pollInMs: backoffMs(POLL_RETRY_MS, pollFailures, POLL_RETRY_MAX_MS),
    },
  }
}

/** A live screen rereads on every reason to; late poll results are ignored. */
function whileLive(state: ConnectionState, event: ConnectionEvent): Transition {
  switch (event) {
    case "heartbeat_received":
      return { state: { ...state, ...PROVEN }, effects: {} }
    case "orders_hinted":
      return { state: { ...state, ...PROVEN }, effects: { reload: true } }
    case "reconcile_due":
    case "focused":
    case "refresh_requested":
    case "stream_ready":
      return { state, effects: { reload: true } }
    case "stream_failed":
    case "heartbeat_missed":
      return streamFailed(state)
    case "poll_succeeded":
    case "poll_failed":
    case "reload_failed":
      return unchanged(state)
  }
}

/** Connecting, reconnecting or polling: the feed must prove itself first. */
function whileDown(state: ConnectionState, event: ConnectionEvent): Transition {
  switch (event) {
    case "stream_ready":
      return {
        state: { ...state, isStreamUnproven: true },
        effects: { reload: true },
      }
    case "heartbeat_received":
    case "orders_hinted":
      if (!state.isStreamUnproven) return unchanged(state)
      return {
        state: { ...state, ...PROVEN, status: "live", isStreamUnproven: false },
        effects: {
          ...(event === "orders_hinted" && { reload: true }),
          ...(isPolling(state.status) && { stopPolling: true }),
        },
      }
    case "stream_failed":
    case "heartbeat_missed":
      return streamFailed(state)
    case "poll_succeeded":
      return {
        state: { ...state, status: "fallback", pollFailures: 0 },
        effects: { reload: true, pollInMs: POLL_MS },
      }
    case "poll_failed":
      return pollFailed(state)
    case "reload_failed":
      // Only polling decides on HTTP; the feed has its own attempts.
      return isPolling(state.status) ? pollFailed(state) : unchanged(state)
    case "focused":
      return { state, effects: retryNow(state) }
    case "refresh_requested":
      // Staff asked: always reread, and retry what is down right now.
      return { state, effects: { reload: true, ...retryNow(state) } }
    case "reconcile_due":
      return unchanged(state)
  }
}

export function nextConnection(
  state: ConnectionState,
  event: ConnectionEvent,
): Transition {
  return state.status === "live"
    ? whileLive(state, event)
    : whileDown(state, event)
}
