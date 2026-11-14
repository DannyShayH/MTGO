import { CUSTOMER_HOME_TEXT } from "@dtc/i18n"
import { Metadata } from "next"

import { getCustomerLocale } from "@lib/data/customer-locale"
import { listRestaurants, searchLocations } from "@lib/data/restaurants"
import { listRegions } from "@lib/data/regions"
import { locationQueryFrom } from "@lib/util/location-query"
import { toJsonLd } from "@lib/util/product-structured-data"
import { getSiteOrigin, listCountryCodes, STORE_NAME } from "@lib/util/site"
import RestaurantsTemplate from "@modules/restaurants/templates"

type Props = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Participation, opening and delivery-area changes show on the next visit.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const [origin, regions, locale] = await Promise.all([
    getSiteOrigin(),
    listRegions(),
    getCustomerLocale(),
  ])
  return {
    title: STORE_NAME,
    description: CUSTOMER_HOME_TEXT[locale].page_description,
    alternates: {
      canonical: `${origin}/${countryCode}`,
      languages: {
        ...Object.fromEntries(
          listCountryCodes(regions).map((code) => [
            `${locale}-${code.toUpperCase()}`,
            `${origin}/${code}`,
          ]),
        ),
        "x-default": origin,
      },
    },
  }
}

export default async function Home({ params, searchParams }: Props) {
  const [{ countryCode }, rawSearch] = await Promise.all([params, searchParams])
  const query = locationQueryFrom(rawSearch)
  const [locale, origin, result, lookup] = await Promise.all([
    getCustomerLocale(),
    getSiteOrigin(),
    query.q ? Promise.resolve(null) : listRestaurants(query),
    query.q ? searchLocations(query.q) : null,
  ])
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: STORE_NAME,
      url: origin,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: STORE_NAME,
      url: `${origin}/${countryCode}`,
    },
  ]
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(structuredData) }}
      />
      <RestaurantsTemplate
        countryCode={countryCode}
        locale={locale}
        query={query}
        result={result}
        lookup={lookup}
      />
    </>
  )
}
