import "server-only"
import { cookies, headers } from "next/headers"
import { MESSAGES, resolveLocale, type Locale } from "@dtc/i18n"
import { LOCALE_COOKIE } from "./config"

export async function getLocale(): Promise<Locale> {
  return resolveLocale({
    chosen: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language") ?? undefined,
  })
}

export async function getMessages() {
  const locale = await getLocale()
  return { locale, messages: MESSAGES[locale] }
}
