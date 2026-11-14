"use server"

import { isLocale } from "@dtc/i18n"
import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag } from "./cookies"
import { setLocaleCookie } from "./locale-actions"
import { revalidateTag } from "next/cache"

/** Save the account preference before remembering it on this browser. */
export async function saveCustomerLanguage(
  _state: unknown,
  formData: FormData,
) {
  const locale = formData.get("language")
  if (!isLocale(locale)) return { success: false }
  try {
    await sdk.store.customer.update(
      { metadata: { preferred_language: locale } },
      {},
      await getAuthHeaders(),
    )
    await setLocaleCookie(locale)
    revalidateTag(await getCacheTag("customers"), { expire: 0 })
    return { success: true }
  } catch {
    return { success: false }
  }
}
