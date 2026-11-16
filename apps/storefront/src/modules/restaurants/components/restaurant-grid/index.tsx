"use client"

import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import { CheckMini } from "@medusajs/icons"
import { Fragment, useState, type ReactNode } from "react"

import { clx, focusRing } from "@modules/common/components/ui"

/** How many Restaurants show before "Show more"; a multiple of every column count. */
const PAGE_SIZE = 24

const restaurantGridColumns =
  "grid grid-cols-1 gap-4 xsmall:grid-cols-2 small:grid-cols-3 small:gap-5 medium:grid-cols-4"

/**
 * The Restaurant list with its heading, count and the "Open now" filter. The
 * cards are rendered on the server and passed in, so this only decides which
 * of them show.
 */
export default function RestaurantGrid({
  locale,
  headingId,
  items,
}: {
  locale: Locale
  headingId: string
  items: { id: string; orderable: boolean; card: ReactNode }[]
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  const [openOnly, setOpenOnly] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const matching = openOnly ? items.filter((item) => item.orderable) : items
  const shown = matching.slice(0, limit)
  const hasNotOrderable = items.some((item) => !item.orderable)
  const countText =
    matching.length === 1
      ? text.restaurant_count_one
      : formatText(text.restaurant_count_other, { count: matching.length })

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            id={headingId}
            className="text-2xl font-semibold leading-8 text-mtogo-text-primary"
          >
            {text.list_heading}
          </h2>
          <p
            className="text-base leading-6 text-mtogo-text-secondary"
            aria-live="polite"
            data-testid="restaurants-count"
          >
            {countText}
          </p>
        </div>
        {hasNotOrderable && (
          <button
            type="button"
            aria-pressed={openOnly}
            onClick={() => {
              setOpenOnly((on) => !on)
              setLimit(PAGE_SIZE)
            }}
            className={clx(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-base font-medium transition-[background-color,border-color,transform] duration-150 ease-out-strong motion-safe:active:scale-[0.97]",
              openOnly
                ? "border-mtogo-action-primary bg-mtogo-surface-selected text-mtogo-text-link"
                : "border-mtogo-border-control bg-mtogo-surface-card text-mtogo-text-primary hover:bg-mtogo-surface-selected",
              focusRing,
            )}
            data-testid="open-now-filter"
          >
            {/* The check says "on" without relying on the colour. */}
            {openOnly && <CheckMini aria-hidden="true" />}
            {text.open_now}
          </button>
        )}
      </div>

      {matching.length === 0 ? (
        <div
          className="flex flex-col items-start gap-3 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card px-5 py-6"
          role="status"
          data-testid="restaurants-none-open"
        >
          <h3 className="text-balance text-xl font-semibold leading-7 text-mtogo-text-primary">
            {text.none_open_title}
          </h3>
          <button
            type="button"
            onClick={() => setOpenOnly(false)}
            className={clx(
              "inline-flex min-h-11 items-center rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-4 text-base font-medium text-mtogo-text-primary transition-[background-color,transform] duration-150 ease-out-strong hover:bg-mtogo-surface-selected motion-safe:active:scale-[0.97]",
              focusRing,
            )}
          >
            {text.show_closed}
          </button>
        </div>
      ) : (
        <ul className={restaurantGridColumns} data-testid="restaurant-list">
          {shown.map((item) => (
            <Fragment key={item.id}>{item.card}</Fragment>
          ))}
        </ul>
      )}

      {matching.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className={clx(
            "inline-flex min-h-11 items-center self-center rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-5 text-base font-medium text-mtogo-text-primary transition-[background-color,transform] duration-150 ease-out-strong hover:bg-mtogo-surface-selected motion-safe:active:scale-[0.97]",
            focusRing,
          )}
          data-testid="restaurants-show-more"
        >
          {text.show_more}
        </button>
      )}
    </section>
  )
}
