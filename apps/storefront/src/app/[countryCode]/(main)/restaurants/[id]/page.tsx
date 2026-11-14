import { CUSTOMER_MENU_TEXT, resolveCustomerLocale } from "@dtc/i18n"
import { Metadata } from "next"

import { retrieveCustomer } from "@lib/data/customer"
import { getLocale } from "@lib/data/locale-actions"
import {
  retrieveRestaurantMenu,
  type RestaurantMenu,
} from "@lib/data/restaurant-menu"
import MenuTemplate, { MenuNotice } from "@modules/menu/templates"

type Props = { params: Promise<{ countryCode: string; id: string }> }

// The menu is read fresh on every visit (ADR-0012).
export const dynamic = "force-dynamic"

async function customerLocale() {
  const customer = await retrieveCustomer().catch(() => null)
  return resolveCustomerLocale(
    customer?.metadata?.preferred_language,
    await getLocale(),
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const [locale, menu] = await Promise.all([
    customerLocale(),
    retrieveRestaurantMenu(id).catch(() => null),
  ])
  const title = CUSTOMER_MENU_TEXT[locale].page_title
  return { title: menu ? `${menu.restaurant.name} – ${title}` : title }
}

export default async function RestaurantMenuPage({ params }: Props) {
  const { countryCode, id } = await params
  const locale = await customerLocale()
  let menu: RestaurantMenu | null
  try {
    menu = await retrieveRestaurantMenu(id)
  } catch {
    return (
      <MenuNotice
        kind="unavailable"
        locale={locale}
        retryHref={`/${countryCode}/restaurants/${encodeURIComponent(id)}`}
      />
    )
  }
  if (!menu) return <MenuNotice kind="not_found" locale={locale} />
  return <MenuTemplate menu={menu} locale={locale} />
}
