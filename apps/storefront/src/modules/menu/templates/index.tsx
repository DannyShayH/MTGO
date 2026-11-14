import { CUSTOMER_MENU_TEXT, type Locale } from "@dtc/i18n"
import type { RestaurantMenu } from "@lib/data/restaurant-menu"
import Dish from "@modules/menu/components/dish"

const page =
  "content-container flex min-h-[60vh] max-w-3xl flex-col gap-6 py-8 small:py-12"

/** Back to the homepage, keeping the selected location. */
function BackLink({ href, locale }: { href: string; locale: Locale }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 w-fit items-center rounded-md text-base font-medium text-mtogo-text-link underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring"
      data-testid="menu-back-link"
    >
      {CUSTOMER_MENU_TEXT[locale].back_to_restaurants}
    </a>
  )
}

function StatusBadge({
  restaurant,
  locale,
}: {
  restaurant: RestaurantMenu["restaurant"]
  locale: Locale
}) {
  const text = CUSTOMER_MENU_TEXT[locale]
  const tone = restaurant.receiving_new_orders
    ? "bg-mtogo-status-success-surface text-mtogo-status-success-text"
    : "bg-mtogo-status-warning-surface text-mtogo-status-warning-text"
  let label = text.open
  if (!restaurant.is_open) label = text.closed
  else if (!restaurant.receiving_new_orders) label = text.not_receiving
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-base font-medium ${tone}`}
      data-testid="restaurant-status"
    >
      {label}
    </span>
  )
}

/** The Customer's view of one active Restaurant's menu, open or closed. */
export default function MenuTemplate({
  menu,
  locale,
  backHref,
}: {
  menu: RestaurantMenu
  locale: Locale
  backHref?: string
}) {
  const text = CUSTOMER_MENU_TEXT[locale]
  const { restaurant, categories } = menu
  return (
    <div className="bg-mtogo-surface-page" lang={locale}>
      <div className={page} data-testid="restaurant-menu">
        {backHref && <BackLink href={backHref} locale={locale} />}
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-balance text-3xl font-semibold leading-tight text-mtogo-text-primary">
              {restaurant.name}
            </h1>
            <StatusBadge restaurant={restaurant} locale={locale} />
          </div>
          {!restaurant.receiving_new_orders && (
            <p
              className="max-w-[60ch] rounded-card bg-mtogo-status-warning-surface px-4 py-3 text-base leading-6 text-mtogo-status-warning-text"
              role="status"
              data-testid="restaurant-not-receiving"
            >
              {restaurant.is_open ? text.not_receiving_note : text.closed_note}
            </p>
          )}
          <p className="text-base leading-6 text-mtogo-text-secondary">
            {text.price_note}
          </p>
        </header>

        {categories.length === 0 && (
          <div className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card px-4 py-6">
            <h2 className="text-lg font-medium text-mtogo-text-primary">
              {text.empty_title}
            </h2>
            <p className="mt-1 text-base leading-6 text-mtogo-text-secondary">
              {text.empty_note}
            </p>
          </div>
        )}

        {categories.length > 1 && (
          <nav aria-label={text.categories}>
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <a
                    href={`#${category.id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-mtogo-border-control bg-mtogo-surface-card px-4 text-base font-medium text-mtogo-text-primary hover:bg-mtogo-surface-selected focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring"
                  >
                    {category.name[locale]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {categories.map((category) => (
          <section
            key={category.id}
            id={category.id}
            aria-labelledby={`${category.id}-title`}
            className="scroll-mt-24"
            data-testid="menu-category"
          >
            <h2
              id={`${category.id}-title`}
              className="text-xl font-semibold leading-7 text-mtogo-text-primary"
            >
              {category.name[locale]}
            </h2>
            <ul className="mt-2 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card px-4">
              {category.dishes.map((dish) => (
                <Dish key={dish.id} dish={dish} locale={locale} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/** The Restaurant is unknown or not on MTOGO, or the menu could not be loaded. */
export function MenuNotice({
  kind,
  locale,
  retryHref,
  backHref,
}: {
  kind: "not_found" | "unavailable"
  locale: Locale
  retryHref?: string
  backHref?: string
}) {
  const text = CUSTOMER_MENU_TEXT[locale]
  const isError = kind === "unavailable"
  return (
    <div className="bg-mtogo-surface-page" lang={locale}>
      <div className={page} data-testid={`restaurant-menu-${kind}`}>
        {backHref && <BackLink href={backHref} locale={locale} />}
        <div
          className={`rounded-card px-4 py-6 ${
            isError
              ? "bg-mtogo-status-error-surface text-mtogo-status-error-text"
              : "border border-mtogo-border-subtle bg-mtogo-surface-card text-mtogo-text-primary"
          }`}
          role={isError ? "alert" : undefined}
        >
          <h1 className="text-xl font-semibold leading-7">
            {text[`${kind}_title`]}
          </h1>
          <p className="mt-1 text-base leading-6">{text[`${kind}_note`]}</p>
          {isError && retryHref && (
            <a
              href={retryHref}
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-mtogo-action-primary px-4 text-base font-medium text-mtogo-text-on-primary hover:bg-mtogo-action-primary-hover active:bg-mtogo-action-primary-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring"
            >
              {text.retry}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
