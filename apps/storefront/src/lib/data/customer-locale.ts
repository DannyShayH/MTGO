import "server-only"
import { resolveCustomerLocale, type Locale } from "@dtc/i18n"
import type { HttpTypes } from "@medusajs/types"
import { retrieveCustomer } from "./current-customer"
import { getLocale } from "./locale-actions"

/** The Customer's language: a saved account preference, else the remembered or browser choice (#85). */
export async function getCustomerLocale(
  customer?: HttpTypes.StoreCustomer | null,
): Promise<Locale> {
  const currentCustomer =
    customer === undefined ? await retrieveCustomer() : customer
  return resolveCustomerLocale(
    currentCustomer?.metadata?.preferred_language,
    await getLocale(),
  )
}
