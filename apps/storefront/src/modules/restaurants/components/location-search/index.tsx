"use client"

import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"

import { searchLocations } from "@lib/data/restaurants"
import { choiceQuery, type LocationChoice } from "@lib/util/location-choices"
import { clx, focusRing } from "@modules/common/components/ui"
import { describeChoice } from "@modules/restaurants/components/location-choices"

const DEBOUNCE_MS = 250

type Lookup =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "found"; q: string; choices: LocationChoice[] }
  | { state: "failed" }

/**
 * The homepage's location field: a combobox over the Danish register. It is
 * a plain search form first, so the server renders the choices without
 * JavaScript; with it, choices appear while typing and a selection navigates
 * to the filtered list. Selecting never changes an address or a basket.
 */
export default function LocationSearch({
  countryCode,
  locale,
  initialQuery = "",
  tone = "primary",
  autoFocus = false,
}: {
  countryCode: string
  locale: Locale
  initialQuery?: string
  /** The surface the field sits on: the teal band or a card. */
  tone?: "primary" | "card"
  autoFocus?: boolean
}) {
  const onPrimary = tone === "primary"
  const text = CUSTOMER_HOME_TEXT[locale]
  const router = useRouter()
  const listId = useId()
  const [value, setValue] = useState(initialQuery)
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const requestNumber = useRef(0)
  const blurTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
    },
    [],
  )

  // Looks the typed text up after a short pause; a later keystroke cancels an earlier lookup.
  useEffect(() => {
    const q = value.trim()
    if (!q) return
    const request = ++requestNumber.current
    const timer = window.setTimeout(async () => {
      setLookup({ state: "searching" })
      const result = await searchLocations(q)
      if (request !== requestNumber.current) return
      setLookup(
        result.state === "found"
          ? { state: "found", q, choices: result.choices }
          : { state: "failed" },
      )
      setActive(-1)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [value])

  const choices = lookup.state === "found" ? lookup.choices : []
  const showList = open && lookup.state === "found" && choices.length > 0

  // The selected location is shown above the list, so the field is free for the next search.
  const select = (choice: LocationChoice) => {
    setOpen(false)
    requestNumber.current += 1
    setValue("")
    setLookup({ state: "idle" })
    router.push(`/${countryCode}${choiceQuery(choice)}`)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && choices.length) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index + 1) % choices.length)
    } else if (event.key === "ArrowUp" && choices.length) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index <= 0 ? choices.length - 1 : index - 1))
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault()
      select(choices[active])
    } else if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const status =
    lookup.state === "searching"
      ? text.searching
      : lookup.state === "found" && value.trim() && choices.length === 0
        ? formatText(text.no_matches, { q: lookup.q })
        : null

  return (
    <form
      action={`/${countryCode}`}
      method="get"
      role="search"
      className="flex flex-col gap-3"
      onSubmit={() => setOpen(false)}
    >
      <label
        htmlFor="location-search"
        className={clx(
          "text-balance font-medium",
          onPrimary ? "text-xl leading-7" : "text-base leading-6",
        )}
      >
        {text.search_label}
      </label>
      <div className="relative flex flex-col gap-3 xsmall:flex-row">
        <div className="relative flex-1">
          <input
            id="location-search"
            name="q"
            type="search"
            role="combobox"
            autoComplete="off"
            // Only set when the Customer has just asked to change location.
            autoFocus={autoFocus}
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={
              showList && active >= 0 ? `${listId}-${active}` : undefined
            }
            aria-describedby="location-search-hint"
            placeholder={text.search_placeholder}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setOpen(true)
              if (!event.target.value.trim()) {
                requestNumber.current += 1
                setLookup({ state: "idle" })
              }
            }}
            onFocus={() => {
              if (blurTimer.current) window.clearTimeout(blurTimer.current)
              blurTimer.current = null
              setOpen(true)
            }}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => {
                setOpen(false)
                blurTimer.current = null
              }, 120)
            }}
            onKeyDown={onKeyDown}
            className={clx(
              "h-12 w-full rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-4 text-base text-mtogo-text-primary placeholder:text-mtogo-text-secondary",
              onPrimary && "focus-visible:ring-offset-mtogo-action-primary",
              focusRing,
            )}
            data-testid="location-search-input"
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={text.suggestions_label}
            hidden={!showList}
            className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 max-h-80 overflow-y-auto rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card py-1 text-mtogo-text-primary shadow-lg"
            data-testid="location-suggestions"
          >
            {choices.map((choice, index) => {
              const { primary, secondary } = describeChoice(choice, text)
              return (
                <li
                  key={primary}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(choice)}
                  onMouseEnter={() => setActive(index)}
                  className={clx(
                    "flex min-h-11 cursor-pointer flex-col justify-center px-4 py-2",
                    index === active && "bg-mtogo-surface-selected",
                  )}
                >
                  <span className="text-base font-medium leading-6">
                    {primary}
                  </span>
                  {secondary && (
                    <span className="text-base leading-6 text-mtogo-text-secondary">
                      {secondary}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <button
          type="submit"
          className={clx(
            "inline-flex h-12 shrink-0 items-center justify-center rounded-md px-5 text-base font-medium transition-[background-color,transform] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none",
            onPrimary
              ? "bg-mtogo-surface-card text-mtogo-text-link hover:bg-mtogo-surface-selected focus-visible:ring-offset-mtogo-action-primary"
              : "bg-mtogo-action-primary text-mtogo-text-on-primary hover:bg-mtogo-action-primary-hover active:bg-mtogo-action-primary-pressed",
            focusRing,
          )}
        >
          {text.search_button}
        </button>
      </div>
      <p id="location-search-hint" className="text-base leading-6">
        {text.search_hint}
      </p>
      <div
        role="status"
        aria-live="polite"
        className="min-h-6 text-base leading-6"
      >
        {status && <span data-testid="location-search-status">{status}</span>}
        {lookup.state === "failed" && (
          <span
            className="inline-block rounded-md bg-mtogo-status-error-surface px-3 py-1 text-mtogo-status-error-text"
            data-testid="location-search-failed"
          >
            {text.lookup_failed}
          </span>
        )}
      </div>
    </form>
  )
}
