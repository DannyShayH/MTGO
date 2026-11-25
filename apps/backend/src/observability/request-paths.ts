import type { IncomingMessage } from "node:http"

/** Node's diagnostics channel for every request, before Express runs. */
export const REQUEST_START = "http.server.request.start"

/**
 * Monitoring, probe and static traffic is neither an ordinary API total nor a
 * failure record. Matched on the raw path, before any label is chosen.
 */
const EXCLUDED_PATHS = [
  /^\/health\/?$/i,
  /^\/metrics\/?$/i,
  /^\/app(\/|$)/i,
  /^\/static\//i,
]

export const pathOf = (url: string) => url.split("?")[0]

/** Health, scrape, Admin and static paths, ignoring any query string. */
export function isExcludedPath(url: string): boolean {
  return EXCLUDED_PATHS.some((pattern) => pattern.test(pathOf(url)))
}

/** The request object Node emits, once Express has decorated it. */
export type RoutedRequest = IncomingMessage & { route?: { path?: unknown } }

/** Express's documented `req.route` pattern, when a route has matched. */
export function matchedRoute(request: RoutedRequest): string | undefined {
  const path = request.route?.path
  if (typeof path === "string" || path instanceof RegExp) return String(path)
  return undefined
}
