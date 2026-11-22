"use server"

import { isLocale, resolveLocale } from "@dtc/i18n"
import { headers } from "next/headers"
import { cookies as nextCookies } from "next/headers"

const LOCALE_COOKIE_NAME = "_medusa_locale"

/**
 * Gets the current locale from cookies
 */
export const getLocale = async (): Promise<string | null> => {
  try {
    const cookies = await nextCookies()
    return resolveLocale({
      chosen: cookies.get(LOCALE_COOKIE_NAME)?.value,
      acceptLanguage: (await headers()).get("accept-language") ?? undefined,
    })
  } catch {
    return null
  }
}

/**
 * Sets the locale cookie
 */
export const setLocaleCookie = async (locale: string) => {
  if (!isLocale(locale)) throw new Error("customer_language_invalid")
  const cookies = await nextCookies()
  cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false, // Allow client-side access
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}
