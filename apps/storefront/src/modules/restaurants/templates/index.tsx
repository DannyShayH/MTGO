import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import type {
  LocationLookupResult,
  PublicRestaurant,
  RestaurantListingResult,
} from "@lib/data/restaurants"
import { locationSearch, type LocationQuery } from "@lib/util/location-query"
import LocationBar from "@modules/restaurants/components/location-bar"
import LocationChoices from "@modules/restaurants/components/location-choices"
import LocationSearch from "@modules/restaurants/components/location-search"
import RestaurantsNotice from "@modules/restaurants/components/notice"
import RestaurantCard from "@modules/restaurants/components/restaurant-card"
import RestaurantGrid from "@modules/restaurants/components/restaurant-grid"

const LIST_HEADING_ID = "restaurants-heading"

/** Restaurants a Customer can order from come first, then open ones, then closed ones. */
const rank = (restaurant: PublicRestaurant) =>
  restaurant.is_open ? (restaurant.receiving_new_orders ? 0 : 1) : 2

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
  const locationLabel = !location
    ? null
    : location.kind === "postal_code"
      ? formatText(text.selected_postal_code, {
          postal_code: location.postal_code ?? "",
          name: location.name,
        })
      : formatText(text.selected_town, { name: location.name })
  const restaurants = [...(listing?.restaurants ?? [])].sort(
    (a, b) => rank(a) - rank(b),
  )

  return (
    <div
      className="bg-mtogo-surface-page"
      lang={locale}
      data-testid="restaurants-home"
    >
      {/* With a location chosen, the search band gives way to one line, so
          the Restaurants start at the top of the screen. */}
      {location && locationLabel ? (
        <LocationBar
          key={locationLabel}
          label={locationLabel}
          note={
            location.kind === "town"
              ? formatText(text.town_note, {
                  name: location.name,
                  count: location.postal_codes,
                })
              : undefined
          }
          countryCode={countryCode}
          locale={locale}
        />
      ) : (
        <section className="bg-mtogo-action-primary text-mtogo-text-on-primary">
          <div className="content-container flex max-w-3xl flex-col gap-4 pb-4 pt-6 small:pb-6 small:pt-10">
            <h1 className="text-balance text-2xl font-semibold leading-tight small:text-3xl small:leading-tight">
              {text.heading}
            </h1>
            <LocationSearch
              countryCode={countryCode}
              locale={locale}
              initialQuery={query.q ?? ""}
            />
          </div>
        </section>
      )}

      <div className="content-container flex min-h-[40vh] flex-col gap-6 py-6 small:py-8">
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

        {listing && restaurants.length === 0 && (
          <section
            aria-labelledby={LIST_HEADING_ID}
            className="flex flex-col gap-4"
          >
            <h2
              id={LIST_HEADING_ID}
              className="text-2xl font-semibold leading-8 text-mtogo-text-primary"
            >
              {text.list_heading}
            </h2>
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
          </section>
        )}
        {listing && restaurants.length > 0 && (
          <RestaurantGrid
            locale={locale}
            headingId={LIST_HEADING_ID}
            items={restaurants.map((restaurant) => ({
              id: restaurant.id,
              orderable: restaurant.is_open && restaurant.receiving_new_orders,
              card: (
                <RestaurantCard
                  restaurant={restaurant}
                  location={location}
                  menuSearch={menuSearch}
                  locale={locale}
                />
              ),
            }))}
          />
        )}
      </div>
    </div>
  )
}
