import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import type { PublicRestaurant, SelectedLocation } from "@lib/data/restaurants"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { PhotoWithPlaceholder } from "@modules/common/components/photo-with-placeholder"

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
  const orderable = restaurant.is_open && restaurant.receiving_new_orders
  const coverage = coverageText(restaurant, location, text)
  return (
    <li
      className="relative flex"
      data-testid="restaurant-card"
      data-restaurant-id={restaurant.id}
      data-open={restaurant.is_open}
    >
      <article className="flex w-full flex-col overflow-hidden rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card transition-[box-shadow,transform] duration-150 ease-out-strong focus-within:ring-2 focus-within:ring-mtogo-focus-ring focus-within:ring-offset-2 focus-within:ring-offset-mtogo-surface-page motion-reduce:transition-none motion-safe:[&:has(a:active)]:scale-[0.99] [@media(hover:hover)]:hover:shadow-md">
        <div className="relative">
          {/* A Restaurant that cannot take Orders is dimmed; the label on the
              photo says why, so the state never rests on the dimming alone. */}
          <div className={orderable ? undefined : "opacity-60 grayscale"}>
            <PhotoWithPlaceholder
              kind="cover"
              url={restaurant.cover?.url}
              name={restaurant.name}
              missingText={text.no_cover}
            />
          </div>
          <span
            className={`absolute left-3 top-3 inline-flex rounded-full px-3 py-1 text-base font-medium leading-6 shadow-sm ${
              status.tone === "success"
                ? "bg-mtogo-status-success-surface text-mtogo-status-success-text"
                : "bg-mtogo-status-warning-surface text-mtogo-status-warning-text"
            }`}
            data-testid="restaurant-card-status"
          >
            {status.label}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="min-w-0 text-balance text-lg font-semibold leading-6 text-mtogo-text-primary">
            <LocalizedClientLink
              href={`/restaurants/${encodeURIComponent(restaurant.id)}${menuSearch}`}
              className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
              data-testid="restaurant-card-link"
            >
              {restaurant.name}
            </LocalizedClientLink>
          </h3>
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
