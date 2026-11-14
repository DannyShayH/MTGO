import "server-only"
import { cookies, headers } from "next/headers"
import { MESSAGES, resolveLocale } from "@dtc/i18n"
import { httpStatus } from "@dtc/logging"
import { log } from "@lib/logger"

/** Keep the status for callers, and never expose backend text to a Customer. */
export default async function medusaError(error: unknown): Promise<never> {
  const status = httpStatus(error)
  log("upstream.request.failed", { status })
  const locale = resolveLocale({
    chosen: (await cookies()).get("_medusa_locale")?.value.split("-")[0],
    acceptLanguage: (await headers()).get("accept-language") ?? undefined,
  })
  throw Object.assign(new Error(MESSAGES[locale].codes.unknown_error), {
    status,
  })
}
