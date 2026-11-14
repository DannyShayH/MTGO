"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { isLocale, resolveLocale } from "@dtc/i18n"
import { headers } from "next/headers"
import { cookies as nextCookies } from "next/headers"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"

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

/**
 * Updates the locale preference via SDK and stores in cookie.
 * Also updates the cart with the new locale if one exists.
 */
export const updateLocale = async (localeCode: string): Promise<string> => {
  if (!isLocale(localeCode)) throw new Error("customer_language_invalid")
  const authHeaders = await getAuthHeaders()
  if ("authorization" in authHeaders) {
    await sdk.store.customer.update(
      { metadata: { preferred_language: localeCode } },
      {},
      authHeaders,
    )
    revalidateTag(await getCacheTag("customers"), { expire: 0 })
  }
  await setLocaleCookie(localeCode)

  // Update cart with the new locale if a cart exists
  const cartId = await getCartId()
  if (cartId) {
    const headers = {
      ...(await getAuthHeaders()),
    }

    await sdk.store.cart.update(cartId, { locale: localeCode }, {}, headers)

    const cartCacheTag = await getCacheTag("carts")
    if (cartCacheTag) {
      revalidateTag(cartCacheTag, { expire: 0 })
    }
  }

  // Revalidate relevant caches to refresh content
  const productsCacheTag = await getCacheTag("products")
  if (productsCacheTag) {
    revalidateTag(productsCacheTag, { expire: 0 })
  }

  const categoriesCacheTag = await getCacheTag("categories")
  if (categoriesCacheTag) {
    revalidateTag(categoriesCacheTag, { expire: 0 })
  }

  const collectionsCacheTag = await getCacheTag("collections")
  if (collectionsCacheTag) {
    revalidateTag(collectionsCacheTag, { expire: 0 })
  }

  return localeCode
}
