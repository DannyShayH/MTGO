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
  // The agent feed names its own revocation code (#165); both end access.
  code === "delivery_agent_access_revoked"
    ? "staff_access_revoked"
    : FEED_ENDED_CODES.includes(code as FeedEndedCode)
      ? (code as FeedEndedCode)
      : "session_expired"

/** Where a screen goes when its session ended. */
export const endedPath = (code: FeedEndedCode) =>
  code === "signed_out" ? "/sign-in" : `/session-ended?code=${code}`

/** Who the browser's partner cookie signs in right now, if anyone. */
export type CookieHolder = "staff" | "delivery_agent" | "nobody"

/**
 * Restaurant staff and Delivery agents share one cookie. A screen whose
 * session ended because the browser signed in as the other role must not
 * clear that newer session (#253): it goes to that role's home instead.
 * `undefined` means the cookie signs nobody in and is cleared.
 */
/**
 * Who the cookie signs in, from the two backend answers. Only an answer that
 * names an agent counts as a Delivery agent session: an empty or unexpected
 * success must not keep a cookie that no longer signs anyone in.
 */
export function cookieHolderOf(read: {
  staffAuthorized: boolean
  agent: unknown
}): CookieHolder {
  if (read.staffAuthorized) return "staff"
  const id = (read.agent as { agent?: { id?: unknown } } | null | undefined)
    ?.agent?.id
  return typeof id === "string" && id !== "" ? "delivery_agent" : "nobody"
}

const HOME_OF: Record<CookieHolder, string | undefined> = {
  staff: "/overview",
  delivery_agent: "/delivery",
  nobody: undefined,
}
export const homeOfCookieHolder = (holder: CookieHolder) => HOME_OF[holder]

const isSessionEndedCode = (code: string | null): code is SessionEndedCode =>
  SESSION_ENDED_CODES.includes(code as SessionEndedCode)

/**
 * The sign-in page /session-ended sends the browser to. It is a path, not a
 * URL: behind the proxy the request's own URL names the container's address
 * (`localhost:8100`), never the public host (#253).
 */
export function sessionEndedSignInPath(code: string | null) {
  if (!isSessionEndedCode(code)) return "/sign-in"
  return `/sign-in?${new URLSearchParams({ message: code })}`
}

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

/**
 * Where a Delivery agent's workspace goes when its feed or check ends the
 * session (#165): a revoked agent gets the access-ended notice, anything
 * else (expired token, signed out elsewhere) just the sign-in page.
 */
export const deliveryEndedPath = (code: FeedEndedCode) =>
  code === "staff_access_revoked"
    ? "/delivery-sign-in?message=access_ended"
    : "/delivery-sign-in"
