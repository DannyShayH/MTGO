import { CUSTOMER_MENU_TEXT, formatDkk, type Locale } from "@dtc/i18n"
import type { MenuDish } from "@lib/data/restaurant-menu"

/**
 * One dish on the Customer menu. Restaurant text is rendered as text and
 * wraps; nothing a Customer needs to choose food is cut off or hover-only.
 */
export default function Dish({
  dish,
  locale,
}: {
  dish: MenuDish
  locale: Locale
}) {
  const text = CUSTOMER_MENU_TEXT[locale]
  const name = dish.name[locale]
  return (
    <li
      className="flex gap-4 border-b border-mtogo-border-subtle py-5 last:border-b-0"
      data-testid="menu-dish"
      data-sold-out={dish.is_sold_out}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-base font-medium leading-6 text-mtogo-text-primary">
          {name}
        </h3>
        {dish.description && (
          <p className="max-w-[60ch] text-base leading-6 text-mtogo-text-secondary">
            {dish.description[locale]}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className="text-base font-semibold tabular-nums text-mtogo-text-primary"
            data-testid="menu-dish-price"
          >
            {formatDkk(dish.price.amount, locale)}
          </span>
          {dish.is_sold_out && (
            <span className="inline-flex flex-wrap items-center gap-x-2 text-base text-mtogo-text-secondary">
              <span className="rounded-full bg-mtogo-status-warning-surface px-2.5 py-0.5 font-medium text-mtogo-status-warning-text">
                {text.sold_out}
              </span>
              {text.sold_out_note}
            </span>
          )}
        </p>
        <details
          className="group text-base"
          data-testid="menu-dish-food-information"
        >
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-mtogo-text-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
            >
              ›
            </span>
            {text.allergens_unknown}
          </summary>
          <p className="max-w-[60ch] rounded-card bg-mtogo-status-warning-surface px-3 py-2 leading-6 text-mtogo-status-warning-text">
            {text.allergens_unknown_note}
          </p>
        </details>
      </div>
      {dish.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dish.photo.url}
          alt={name}
          className="aspect-[4/3] w-24 shrink-0 self-start rounded-card object-cover small:w-36"
        />
      ) : (
        <div
          className="flex aspect-[4/3] w-24 shrink-0 items-center justify-center self-start rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-2 small:w-36"
          data-testid="menu-dish-placeholder"
        >
          <span className="sr-only">{text.no_photo}</span>
          <span
            aria-hidden="true"
            className="line-clamp-3 text-center text-xs leading-4 text-mtogo-text-secondary"
          >
            {name}
          </span>
        </div>
      )}
    </li>
  )
}
