import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import type { PublicRestaurant, SelectedLocation } from "@lib/data/restaurants"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/** How much of the selected location this Restaurant's delivery area covers, said honestly. */
function coverageText(
  restaurant: PublicRestaurant,
  location: SelectedLocation | null,
  text: (typeof CUSTOMER_HOME_TEXT)["da"],
) {
  const match = restaurant.delivery_area_match
  if (!location || !match) return null
  if (location.kind === "postal_code")
    return formatText(text.serves_postal_code, {
      postal_code: location.postal_code ?? "",
    })
  if (match.served_postal_codes >= match.location_postal_codes)
    return formatText(text.serves_whole_town, { name: location.name })
  return formatText(text.serves_part_of_town, {
    served: match.served_postal_codes,
    count: match.location_postal_codes,
    name: location.name,
  })
}

/**
 * One Restaurant on the homepage. The whole card opens the menu, with the
 * Restaurant's name as the link, so keyboard and voice users get one target.
 * Covers arrive with #113; until then the name stands in on a calm tile.
 */
export default function RestaurantCard({
  restaurant,
  location,
  menuSearch,
  locale,
}: {
  restaurant: PublicRestaurant
  location: SelectedLocation | null
  menuSearch: string
  locale: Locale
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  const status = restaurant.is_open
    ? restaurant.receiving_new_orders
      ? { label: text.open, tone: "success", note: null }
      : {
          label: text.not_receiving,
          tone: "warning",
          note: text.not_receiving_note,
        }
    : { label: text.closed, tone: "warning", note: text.closed_note }
  const coverage = coverageText(restaurant, location, text)
  return (
    <li
      className="relative flex"
      data-testid="restaurant-card"
      data-restaurant-id={restaurant.id}
      data-open={restaurant.is_open}
    >
      <article className="flex w-full flex-col overflow-hidden rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card transition-[box-shadow,transform] duration-150 ease-out focus-within:ring-2 focus-within:ring-mtogo-focus-ring focus-within:ring-offset-2 focus-within:ring-offset-mtogo-surface-page motion-reduce:transition-none [@media(hover:hover)]:hover:shadow-md">
        {restaurant.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.cover.url}
            alt=""
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div
            className="flex aspect-video w-full items-center justify-center bg-mtogo-surface-selected px-6"
            data-testid="restaurant-cover-placeholder"
          >
            <span className="sr-only">{text.no_cover}</span>
            <span
              aria-hidden="true"
              className="line-clamp-3 text-balance text-center text-2xl font-semibold leading-tight text-mtogo-text-link"
            >
              {restaurant.name}
            </span>
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 className="min-w-0 text-balance text-lg font-semibold leading-6 text-mtogo-text-primary">
              <LocalizedClientLink
                href={`/restaurants/${encodeURIComponent(restaurant.id)}${menuSearch}`}
                className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
                data-testid="restaurant-card-link"
              >
                {restaurant.name}
              </LocalizedClientLink>
            </h3>
            <span
              className={`inline-flex shrink-0 rounded-full px-3 py-1 text-base font-medium leading-6 ${
                status.tone === "success"
                  ? "bg-mtogo-status-success-surface text-mtogo-status-success-text"
                  : "bg-mtogo-status-warning-surface text-mtogo-status-warning-text"
              }`}
              data-testid="restaurant-card-status"
            >
              {status.label}
            </span>
          </div>
          <p className="text-base leading-6 text-mtogo-text-secondary">
            {restaurant.address_city}
          </p>
          {coverage && (
            <p
              className="text-base leading-6 text-mtogo-text-primary"
              data-testid="restaurant-card-coverage"
            >
              {coverage}
            </p>
          )}
          {status.note && (
            <p className="text-base leading-6 text-mtogo-text-secondary">
              {status.note}
            </p>
          )}
        </div>
      </article>
    </li>
  )
}
