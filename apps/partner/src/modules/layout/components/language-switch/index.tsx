"use client"

import { LANGUAGE_NAMES, LOCALES, type Locale } from "@dtc/i18n"
import { clx } from "@medusajs/ui"
import { chooseLanguage } from "@lib/data/session"

/** A plain form, so the choice works and is remembered without client state. */
export function LanguageSwitch({
  locale,
  label,
}: {
  locale: Locale
  label: string
}) {
  return (
    <form action={chooseLanguage} aria-label={label}>
      <div
        role="group"
        aria-label={label}
        className="bg-ui-bg-component shadow-borders-base inline-flex rounded-md p-0.5"
      >
        {LOCALES.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            aria-pressed={option === locale}
            className={clx(
              "txt-compact-xsmall-plus focus-visible:ring-mtogo-focus-ring min-h-11 rounded px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 [@media(pointer:fine)]:min-h-0 [@media(pointer:fine)]:px-2",
              option === locale
                ? "bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest"
                : "text-ui-fg-muted hover:text-ui-fg-subtle",
            )}
          >
            {LANGUAGE_NAMES[option]}
          </button>
        ))}
      </div>
    </form>
  )
}
