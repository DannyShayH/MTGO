import type { Instrumentation } from "next"

let logRequestError: Instrumentation.onRequestError | undefined

/**
 * Next.js calls this for every server error it captures: a page, route
 * handler or Server Action (#247). Only the error's safe class, the route
 * pattern, the method and a validated request ID are logged, once per request.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // The shared logger needs Node.js.
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // src/lib/logger.ts is server-only, which this hook cannot import.
  const { createRequestErrorLogger } = await import("@dtc/logging")
  logRequestError ??= createRequestErrorLogger("partner")
  await logRequestError(error, request, context)
}
