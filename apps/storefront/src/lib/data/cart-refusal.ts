import "server-only"
import type { CartRefusalCode } from "@dtc/i18n"
import { httpStatus } from "@dtc/logging"
import { logUpstreamFailure } from "@lib/logger"

/**
 * What a cart or checkout server action answers when the backend refused it
 * (#252). Actions return this instead of throwing: a production build
 * replaces a thrown server-action message with a React error number.
 * `detail` is an explanation already worded in the Customer's language.
 */
export type CartRefusal = { error: { code: CartRefusalCode; detail?: string } }

/**
 * Logs a failed backend call once and returns the refusal it stands for, or
 * `fallback`. A stable refusal code is the backend's message itself
 * (`error-handler.ts`); the Medusa SDK keeps only the message, not the body.
 */
export function refusalOf(
  error: unknown,
  fallback: CartRefusalCode,
): CartRefusal {
  const status = httpStatus(error)
  logUpstreamFailure({ status })
  if (status === 409) return { error: { code: "cart_busy" } }
  const code = error instanceof Error ? error.message : undefined
  if (
    code === "checkout_review_incomplete" ||
    code === "basket_review_required"
  )
    return { error: { code } }
  return { error: { code: fallback } }
}
