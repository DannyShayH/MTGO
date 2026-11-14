import "server-only"
import { resolveCustomerLocale, type Locale } from "@dtc/i18n"
import { retrieveCustomer } from "./customer"
import { getLocale } from "./locale-actions"

/** The Customer's language: a saved account preference, else the remembered or browser choice (#85). */
export async function getCustomerLocale(): Promise<Locale> {
  const customer = await retrieveCustomer()
  return resolveCustomerLocale(
    customer?.metadata?.preferred_language,
    await getLocale(),
  )
}
