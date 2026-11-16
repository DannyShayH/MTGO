"use client"

import { CUSTOMER_HOME_TEXT, type Locale } from "@dtc/i18n"
import { MapPin } from "@medusajs/icons"
import { useId, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx, focusRing } from "@modules/common/components/ui"
import LocationSearch from "@modules/restaurants/components/location-search"

const action = clx(
  "inline-flex min-h-11 items-center rounded-md px-3 text-base font-medium text-mtogo-text-link underline-offset-4 transition-transform duration-150 ease-out-strong hover:underline motion-safe:active:scale-[0.97]",
  focusRing,
)

/**
 * The selected location as one line under the header, so the Restaurants start
 * at the top of the screen. "Change location" opens the search in place;
 * "Show all Restaurants" clears the location.
 */
export default function LocationBar({
  label,
  note,
  countryCode,
  locale,
}: {
  label: string
  note?: string
  countryCode: string
  locale: Locale
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  const [changing, setChanging] = useState(false)
  const labelId = useId()
  const panelId = useId()
  return (
    <section
      className="border-b border-mtogo-border-subtle bg-mtogo-surface-card"
      data-testid="selected-location"
    >
      <div className="content-container flex flex-col gap-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6">
          <h1
            id={labelId}
            className="flex min-w-0 items-center gap-2 py-2 text-lg font-semibold leading-6 text-mtogo-text-primary"
          >
            <MapPin
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-mtogo-action-primary"
            />
            {label}
          </h1>
          <div className="-mx-3 flex flex-wrap items-center">
            <button
              type="button"
              className={action}
              aria-expanded={changing}
              aria-controls={panelId}
              onClick={() => setChanging((open) => !open)}
              data-testid="change-location"
            >
              {text.change_location}
            </button>
            <LocalizedClientLink
              href="/"
              className={action}
              aria-describedby={labelId}
              data-testid="clear-location"
            >
              {text.clear_location}
            </LocalizedClientLink>
          </div>
        </div>
        {note && (
          <p className="max-w-[70ch] pb-2 text-base leading-6 text-mtogo-text-secondary">
            {note}
          </p>
        )}
        <div id={panelId} hidden={!changing}>
          {changing && (
            <div className="max-w-3xl pb-2 pt-1 motion-safe:animate-fade-in">
              <LocationSearch
                countryCode={countryCode}
                locale={locale}
                tone="card"
                autoFocus
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
