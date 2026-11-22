import type { LocationShareResult } from "@lib/data/delivery-agent"

/** One position the phone measured, with its own observation time (epoch ms). */
export type LocationSample = {
  latitude: number
  longitude: number
  accuracy_m: number | null
  observed_at: number
}

/** What the transit sharing loop knows when it decides whether to send. */
export type UploadState = {
  /** The newest position the phone gave; older ones are already dropped. */
  latest: LocationSample | null
  /** The last observation the backend received, and when it was sent. */
  sent: { observed_at: number; at: number } | null
  isInFlight: boolean
  isVisible: boolean
  isOnline: boolean
}

/**
 * Sharing with the Customer during transit (#166): waiting for the first
 * position, shared (with the observation the backend keeps), offline, or a
 * failed send that is retried.
 */
export type TransitState =
  | { phase: "waiting" | "offline" | "failed" }
  | { phase: "shared"; observed_at: string }

/** Send a newer position at most this often (the server coalesces within five seconds). */
export const UPLOAD_EVERY_MS = 15_000
/** Ask the phone for a new position once the latest is this old. */
export const REFRESH_AFTER_MS = 30_000

/**
 * Whether to send the latest position for the collected delivery now (#166).
 * Only the newest position is ever kept, so nothing queues while offline or
 * hidden; the same observation is never sent twice, so a phone that stops
 * measuring shows its real age to the Customer instead of looking current.
 * What the server accepts (age, accuracy) is the server's decision alone.
 */
export function shouldUpload(state: UploadState, now: number) {
  const { latest, sent } = state
  if (!latest || !state.isVisible || !state.isOnline || state.isInFlight)
    return false
  if (!sent) return true
  return (
    latest.observed_at > sent.observed_at && now - sent.at >= UPLOAD_EVERY_MS
  )
}

/** Whether the latest position is old enough to ask the phone again. */
export function needsFreshPosition(latest: LocationSample | null, now: number) {
  return !latest || now - latest.observed_at >= REFRESH_AFTER_MS
}

/**
 * The transit uploader for one collected delivery (#166). `offer` keeps the
 * newest position and sends it when due; `flush` sends what is due, for the
 * timer and reconnection. It reports each outcome, and once the server says
 * the delivery is no longer the agent's active work it calls `onEnded` and
 * sends nothing more. `dispose` drops answers still on their way.
 */
export function createTransitUploader(options: {
  send: (sample: LocationSample) => Promise<LocationShareResult>
  report: (state: TransitState) => void
  onEnded: () => void
  environment: () => { isVisible: boolean; isOnline: boolean }
  now?: () => number
}) {
  const now = options.now ?? Date.now
  let latest: LocationSample | null = null
  let sent: UploadState["sent"] = null
  let isInFlight = false
  let isOver = false

  async function flush() {
    if (isOver) return
    const { isVisible, isOnline } = options.environment()
    if (!isOnline && latest) options.report({ phase: "offline" })
    if (!shouldUpload({ latest, sent, isInFlight, isVisible, isOnline }, now()))
      return
    const sending = latest as LocationSample
    isInFlight = true
    const result = await options
      .send(sending)
      .catch((): LocationShareResult => ({ status: "unavailable" }))
    isInFlight = false
    if (isOver) return
    if (result.status === "ended") {
      isOver = true
      options.onEnded()
      return
    }
    if (result.status === "unavailable") {
      // Try the newest position again after the usual interval.
      sent = { observed_at: sent?.observed_at ?? -Infinity, at: now() }
      options.report({
        phase: options.environment().isOnline ? "failed" : "offline",
      })
      return
    }
    // A refused sample is not sent again either.
    sent = { observed_at: sending.observed_at, at: now() }
    if (result.status === "shared" && result.observed_at)
      options.report({ phase: "shared", observed_at: result.observed_at })
  }

  return {
    offer(sample: LocationSample) {
      if (!latest || sample.observed_at > latest.observed_at) latest = sample
      return flush()
    },
    flush,
    latest: () => latest,
    /**
     * The page was hidden (a call, a lock, another app): forget the waiting
     * position, so returning sends the phone's next measurement rather than
     * one taken before the pause.
     */
    suspend() {
      latest = null
    },
    dispose() {
      isOver = true
    },
  }
}
