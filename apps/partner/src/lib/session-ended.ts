/**
 * Why a partner session ended, shared by server code and the browser (so it
 * imports nothing server-only). Each code has a text in @dtc/i18n.
 */
export const SESSION_ENDED_CODES = [
  "staff_access_revoked",
  "session_expired",
] as const
export type SessionEndedCode = (typeof SESSION_ENDED_CODES)[number]

/** The kitchen feed and its check also end when the cookie is gone. */
export type FeedEndedCode = SessionEndedCode | "signed_out"
const FEED_ENDED_CODES: readonly FeedEndedCode[] = [
  ...SESSION_ENDED_CODES,
  "signed_out",
]

/**
 * Branch on the status only (coding standard 7.2): 403 is the one refusal
 * partner routes have for a valid token, staff_access_revoked, and 401 means
 * the token stopped working.
 */
export function sessionEndedCodeForStatus(
  status: number | undefined,
): SessionEndedCode | undefined {
  if (status === 403) return "staff_access_revoked"
  if (status === 401) return "session_expired"
  return undefined
}

/** A code read from the network; an unreadable reason still ends the session. */
export const feedEndedCodeOf = (code: unknown): FeedEndedCode =>
  FEED_ENDED_CODES.includes(code as FeedEndedCode)
    ? (code as FeedEndedCode)
    : "session_expired"

/** Where a screen goes when its session ended. */
export const endedPath = (code: FeedEndedCode) =>
  code === "signed_out" ? "/sign-in" : `/session-ended?code=${code}`

const SESSION_CHANNEL = "mtogo-partner-session"

/**
 * Tells this browser's other partner tabs that staff signed out, once the
 * cookie is deleted. That cannot revoke the stateless token an open kitchen
 * feed already uses, so those tabs end their feed themselves (#148).
 */
export function announceSignOut() {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(SESSION_CHANNEL)
  channel.postMessage("signed_out")
  channel.close()
}

/** Calls `onSignedOut` when another tab signs out; returns the cleanup. */
export function onSignOutElsewhere(onSignedOut: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {}
  const channel = new BroadcastChannel(SESSION_CHANNEL)
  channel.onmessage = (event) => {
    if (event.data === "signed_out") onSignedOut()
  }
  return () => channel.close()
}
