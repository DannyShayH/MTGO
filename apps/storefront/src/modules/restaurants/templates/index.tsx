import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import type {
  LocationLookupResult,
  RestaurantListingResult,
  SelectedLocation,
} from "@lib/data/restaurants"
import { locationSearch, type LocationQuery } from "@lib/util/location-query"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx, focusRing } from "@modules/common/components/ui"
import LocationChoices from "@modules/restaurants/components/location-choices"
import LocationSearch from "@modules/restaurants/components/location-search"
import RestaurantsNotice from "@modules/restaurants/components/notice"
import RestaurantCard from "@modules/restaurants/components/restaurant-card"

const SELECTED_LOCATION_TEXT_ID = "selected-location"

function SelectedLocationBar({
  location,
  locale,
}: {
  location: SelectedLocation
  locale: Locale
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  const label =
    location.kind === "postal_code"
      ? formatText(text.selected_postal_code, {
          postal_code: location.postal_code ?? "",
          name: location.name,
        })
      : formatText(text.selected_town, { name: location.name })
  return (
    <div
      className="flex flex-col gap-2 rounded-card bg-mtogo-surface-selected px-5 py-4"
      data-testid="selected-location"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p
          id={SELECTED_LOCATION_TEXT_ID}
          className="text-lg font-semibold leading-6 text-mtogo-text-primary"
        >
          {label}
        </p>
        <LocalizedClientLink
          href="/"
          className={clx(
            "inline-flex min-h-11 items-center rounded-md px-3 text-base font-medium text-mtogo-text-link underline-offset-4 hover:underline",
            focusRing,
          )}
          aria-describedby={SELECTED_LOCATION_TEXT_ID}
          data-testid="clear-location"
        >
          {text.clear_location}
        </LocalizedClientLink>
      </div>
      {location.kind === "town" && (
        <p className="max-w-[70ch] text-base leading-6 text-mtogo-text-secondary">
          {formatText(text.town_note, {
            name: location.name,
            count: location.postal_codes,
          })}
        </p>
      )}
    </div>
  )
}

/** The Customer homepage: find a Restaurant by where it delivers, then open its menu. */
export default function RestaurantsTemplate({
  countryCode,
  locale,
  query,
  result,
  lookup,
}: {
  countryCode: string
  locale: Locale
  query: LocationQuery & { q?: string }
  result: RestaurantListingResult | null
  lookup: LocationLookupResult | null
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  const listing = result?.state === "listed" ? result.listing : null
  const location = listing?.location ?? null
  const menuSearch = locationSearch(query)
  const homeHref = `/${countryCode}${menuSearch}`
  const countText =
    listing?.count === 1
      ? text.restaurant_count_one
      : formatText(text.restaurant_count_other, { count: listing?.count ?? 0 })

  return (
    <div
      className="bg-mtogo-surface-page"
      lang={locale}
      data-testid="restaurants-home"
    >
      <section className="bg-mtogo-action-primary text-mtogo-text-on-primary">
        <div className="content-container flex max-w-3xl flex-col gap-6 py-10 small:py-16">
          <h1 className="text-balance text-3xl font-semibold leading-tight small:text-4xl small:leading-tight">
            {text.heading}
          </h1>
          <LocationSearch
            countryCode={countryCode}
            locale={locale}
            initialQuery={query.q ?? ""}
          />
        </div>
      </section>

      <div className="content-container flex min-h-[40vh] flex-col gap-6 py-8 small:py-12">
        {lookup?.state === "found" && query.q && (
          <LocationChoices
            q={query.q}
            choices={lookup.choices}
            countryCode={countryCode}
            locale={locale}
          />
        )}
        {lookup?.state === "failed" && (
          <p
            className="rounded-card bg-mtogo-status-error-surface px-5 py-4 text-base leading-6 text-mtogo-status-error-text"
            role="alert"
          >
            {text.lookup_failed}
          </p>
        )}

        {location && (
          <SelectedLocationBar location={location} locale={locale} />
        )}

        {result?.state === "failed" && (
          <RestaurantsNotice
            kind="failed"
            title={text.list_failed_title}
            note={text.list_failed_note}
            locale={locale}
            retryHref={homeHref}
          />
        )}
        {result?.state === "location_refused" && (
          <RestaurantsNotice
            kind="refused"
            title={
              result.refused === "postal_code"
                ? formatText(text.postal_code_unknown_title, {
                    postal_code: query.postal_code ?? "",
                  })
                : formatText(text.town_unknown_title, {
                    name: query.town ?? "",
                  })
            }
            note={
              result.refused === "postal_code"
                ? text.postal_code_unknown_note
                : text.town_unknown_note
            }
            locale={locale}
            showAllHref="/"
          />
        )}

        {listing && (
          <section
            aria-labelledby="restaurants-heading"
            className="flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2
                id="restaurants-heading"
                className="text-2xl font-semibold leading-8 text-mtogo-text-primary"
              >
                {text.list_heading}
              </h2>
              <p
                className="text-base leading-6 text-mtogo-text-secondary"
                data-testid="restaurants-count"
              >
                {countText}
              </p>
            </div>
            {listing.restaurants.length === 0 ? (
              <RestaurantsNotice
                kind="empty"
                title={
                  location
                    ? formatText(text.empty_location_title, {
                        name: location.name,
                      })
                    : text.empty_title
                }
                note={location ? text.empty_location_note : text.empty_note}
                locale={locale}
                showAllHref={location ? "/" : undefined}
              />
            ) : (
              <ul
                className="grid grid-cols-1 gap-5 xsmall:grid-cols-2 small:grid-cols-3"
                data-testid="restaurant-list"
              >
                {listing.restaurants.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    location={location}
                    menuSearch={menuSearch}
                    locale={locale}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
