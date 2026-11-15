import { ChevronRightMini } from "@medusajs/icons"
import {
  CUSTOMER_MENU_TEXT,
  allergenShortName,
  formatDkk,
  type Locale,
} from "@dtc/i18n"
import type { MenuDish } from "@lib/data/restaurant-menu"

type Declared = Extract<
  MenuDish["food_information"]["allergens"],
  { status: "supplied" }
>["contains"]

const FOOD_SYMBOL_CODES = new Set([
  "cereals",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
])
const symbolOf = (code: string) =>
  FOOD_SYMBOL_CODES.has(code) ? `/images/food-symbols/${code}.svg` : null

function IconStack({
  entries,
  limit,
  className,
}: {
  entries: Declared
  limit: number
  className: string
}) {
  return (
    <span aria-hidden="true" className={`ml-2 items-center gap-1 ${className}`}>
      {entries.slice(0, limit).map(
        (entry) =>
          symbolOf(entry.code) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={entry.number}
              src={symbolOf(entry.code)!}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
            />
          ),
      )}
      {entries.length > limit && (
        <span className="text-sm">+{entries.length - limit}</span>
      )}
    </span>
  )
}

/** "Indeholder: Gluten, Fisk", one line per state, for the collapsed summary. */
function Summary({
  entries,
  label,
  locale,
}: {
  entries: Declared
  label: string
  locale: Locale
}) {
  if (!entries.length) return null
  return (
    <span className="inline">
      <span className="font-medium">{label}:</span>{" "}
      <span className="text-mtogo-text-primary">
        {entries.map((entry) => allergenShortName(entry, locale)).join(", ")}
      </span>
    </span>
  )
}

function AllergenNames({
  entries,
  locale,
}: {
  entries: Declared
  locale: Locale
}) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {entries.map((entry) => (
        <li key={entry.number} className="inline-flex items-center gap-1">
          {symbolOf(entry.code) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={symbolOf(entry.code)!}
              alt=""
              aria-hidden="true"
              width={24}
              height={24}
              className="h-6 w-6 shrink-0"
            />
          )}
          <span>
            <span className="tabular-nums text-mtogo-text-secondary">
              {entry.number}.
            </span>{" "}
            {entry.name[locale]}
            {entry.details.length > 0 &&
              ` (${entry.details.map((detail) => detail.name[locale]).join(", ")})`}
          </span>
        </li>
      ))}
    </ul>
  )
}

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
  const allergens = dish.food_information.allergens
  const declared =
    allergens.status === "supplied"
      ? [...allergens.contains, ...allergens.may_contain].sort(
          (a, b) => a.number - b.number,
        )
      : []
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
          <summary className="flex min-h-11 w-full cursor-pointer list-none items-start gap-1.5 rounded-md py-2 text-mtogo-text-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring [&::-webkit-details-marker]:hidden">
            <ChevronRightMini
              aria-hidden="true"
              className="mt-0.5 shrink-0 transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
            />
            <span className="min-w-0 flex-1 leading-6">
              {allergens.status === "unknown" ? (
                text.allergens_unknown
              ) : allergens.none_declared ? (
                text.allergens_none_short
              ) : (
                <>
                  <Summary
                    entries={allergens.contains}
                    label={text.allergens_contains}
                    locale={locale}
                  />
                  {allergens.contains.length > 0 &&
                    allergens.may_contain.length > 0 && (
                      <span
                        aria-hidden="true"
                        className="mx-1.5 text-mtogo-text-secondary"
                      >
                        ·
                      </span>
                    )}
                  <Summary
                    entries={allergens.may_contain}
                    label={text.allergens_may_contain}
                    locale={locale}
                  />
                </>
              )}
              {declared.length > 0 && (
                <>
                  <IconStack
                    entries={declared}
                    limit={3}
                    className="inline-flex align-text-bottom sm:hidden"
                  />
                  <IconStack
                    entries={declared}
                    limit={6}
                    className="hidden align-text-bottom sm:inline-flex"
                  />
                </>
              )}
            </span>
          </summary>
          {allergens.status === "unknown" ? (
            <p className="max-w-[60ch] rounded-card bg-mtogo-status-warning-surface px-3 py-2 leading-6 text-mtogo-status-warning-text">
              {text.allergens_unknown_note}
            </p>
          ) : allergens.none_declared ? (
            <p className="max-w-[60ch] leading-6">{text.allergens_none}</p>
          ) : (
            <div className="max-w-[60ch] space-y-3 leading-6">
              {allergens.contains.length > 0 && (
                <div>
                  <strong>{text.allergens_contains}</strong>
                  <AllergenNames entries={allergens.contains} locale={locale} />
                </div>
              )}
              {allergens.may_contain.length > 0 && (
                <div>
                  <strong>{text.allergens_may_contain}</strong>
                  <AllergenNames
                    entries={allergens.may_contain}
                    locale={locale}
                  />
                </div>
              )}
            </div>
          )}
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
