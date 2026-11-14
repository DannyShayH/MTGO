import { CUSTOMER_MENU_TEXT } from "@dtc/i18n"
import { Metadata } from "next"

import { getCustomerLocale } from "@lib/data/customer-locale"
import {
  retrieveRestaurantMenu,
  type RestaurantMenu,
} from "@lib/data/restaurant-menu"
import { locationQueryFrom, locationSearch } from "@lib/util/location-query"
import MenuTemplate, { MenuNotice } from "@modules/menu/templates"

type Props = {
  params: Promise<{ countryCode: string; id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// The menu is read fresh on every visit (ADR-0012).
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const [locale, menu] = await Promise.all([
    getCustomerLocale(),
    retrieveRestaurantMenu(id).catch(() => null),
  ])
  const title = CUSTOMER_MENU_TEXT[locale].page_title
  return { title: menu ? `${menu.restaurant.name} – ${title}` : title }
}

export default async function RestaurantMenuPage({
  params,
  searchParams,
}: Props) {
  const [{ countryCode, id }, rawSearch] = await Promise.all([
    params,
    searchParams,
  ])
  const locale = await getCustomerLocale()
  // The selected location travels with the menu and back to the homepage.
  const search = locationSearch(locationQueryFrom(rawSearch))
  const backHref = `/${countryCode}${search}`
  let menu: RestaurantMenu | null
  try {
    menu = await retrieveRestaurantMenu(id)
  } catch {
    return (
      <MenuNotice
        kind="unavailable"
        locale={locale}
        retryHref={`/${countryCode}/restaurants/${encodeURIComponent(id)}${search}`}
        backHref={backHref}
      />
    )
  }
  if (!menu)
    return <MenuNotice kind="not_found" locale={locale} backHref={backHref} />
  return <MenuTemplate menu={menu} locale={locale} backHref={backHref} />
}
