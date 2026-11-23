"use client"

import { useEffect, useRef, useState } from "react"
import { ORDER_TEXT, type Locale } from "@dtc/i18n"
import { Button, Input, Label, Select, Text, clx } from "@medusajs/ui"
import {
  CANCELLATION_CATEGORIES,
  PERIODS,
  hasFilters,
  orderSearch,
  queueHref,
  type CancellationCategory,
  type Period,
  type QueueQuery,
} from "@lib/order-queue"
import { useQueueNavigation } from "./queue-transition"

/** Long enough to finish typing a number, short enough to feel live. */
const SEARCH_DELAY_MS = 350
const ALL = "all"
const SEARCH_HINT_ID = "order-search-hint"
const RANGE_ERROR_ID = "order-range-error"

const PERIOD_LABELS = {
  today: "period_today",
  yesterday: "period_yesterday",
  "7d": "period_7d",
  "30d": "period_30d",
  custom: "period_custom",
} as const

/** Select triggers as tall as the other controls, for touch. */
const TRIGGER = "min-h-11 w-full sm:w-48"

/**
 * Search by Order number in every view; History adds a period and the
 * cancellation reason. Every choice lives in the address, so a result can be
 * reloaded, shared or kept through live refreshes, and the form still
 * submits as a plain GET without JavaScript.
 */
export function OrderFilters({
  query,
  locale,
  isRangeInvalid = false,
}: Readonly<{
  query: QueueQuery
  locale: Locale
  isRangeInvalid?: boolean
}>) {
  const text = ORDER_TEXT[locale]
  const { navigate } = useQueueNavigation()
  const [search, setSearch] = useState(query.q ?? "")
  const isSearchInvalid = orderSearch(search) === "invalid"
  // What this field last asked for, so only an outside change (Clear
  // filters, Back) overwrites what staff are still typing.
  const sentRef = useRef(query.q)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The latest query, search text and chosen dates, so a delayed send never
  // undoes a filter chosen while it waited.
  const queryRef = useRef(query)
  const searchRef = useRef(search)
  const datesRef = useRef({ from: query.from, to: query.to })

  useEffect(() => {
    queryRef.current = query
    datesRef.current = { from: query.from, to: query.to }
  }, [query])
  useEffect(() => {
    if (query.q === sentRef.current) return
    sentRef.current = query.q
    searchRef.current = query.q ?? ""
    setSearch(query.q ?? "")
  }, [query.q])
  useEffect(() => () => clearTimeout(timerRef.current), [])

  /** Navigates now, with any number still waiting in the search field. */
  const go = (change: Partial<QueueQuery> = {}) => {
    clearTimeout(timerRef.current)
    const found = orderSearch(searchRef.current)
    const q = found === "invalid" ? queryRef.current.q : found.q
    const next = { q, ...change }
    sentRef.current = next.q
    navigate(queueHref(queryRef.current, next))
  }
  const sendSearch = () => {
    const found = orderSearch(searchRef.current)
    if (found === "invalid" || found.q === sentRef.current) return
    go()
  }
  const later = (send: () => void) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(send, SEARCH_DELAY_MS)
  }
  const isHistory = query.view === "history"

  return (
    <form
      role="search"
      aria-label={text.filters}
      action="/orders"
      method="get"
      onSubmit={(event) => {
        event.preventDefault()
        clearTimeout(timerRef.current)
        sendSearch()
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="view" value={query.view} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-56">
          <Label htmlFor="order-search" className="sr-only">
            {text.search_label}
          </Label>
          <Input
            id="order-search"
            name="q"
            type="search"
            inputMode="numeric"
            autoComplete="off"
            placeholder={text.search_placeholder}
            value={search}
            aria-invalid={isSearchInvalid}
            aria-describedby={isSearchInvalid ? SEARCH_HINT_ID : undefined}
            className="[&_input]:min-h-11"
            onChange={(event) => {
              searchRef.current = event.target.value
              setSearch(event.target.value)
              later(sendSearch)
            }}
          />
          {isSearchInvalid && (
            <Text
              id={SEARCH_HINT_ID}
              size="small"
              className="text-ui-fg-error motion-safe:animate-fade-in"
            >
              {text.search_invalid}
            </Text>
          )}
        </div>
        {isHistory && (
          <>
            <div className="flex flex-col gap-1">
              <Label id="order-period-label" className="sr-only">
                {text.period}
              </Label>
              <Select
                name="period"
                value={query.period ?? ALL}
                onValueChange={(value) =>
                  go({ period: value === ALL ? undefined : (value as Period) })
                }
              >
                <Select.Trigger
                  aria-labelledby="order-period-label"
                  className={TRIGGER}
                >
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value={ALL}>{text.period_all}</Select.Item>
                  {PERIODS.map((period) => (
                    <Select.Item key={period} value={period}>
                      {text[PERIOD_LABELS[period]]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label id="order-reason-label" className="sr-only">
                {text.reason}
              </Label>
              <Select
                name="cancellation_category"
                value={query.cancellation_category ?? ALL}
                onValueChange={(value) =>
                  go({
                    cancellation_category:
                      value === ALL
                        ? undefined
                        : (value as CancellationCategory),
                  })
                }
              >
                <Select.Trigger
                  aria-labelledby="order-reason-label"
                  className={clx(TRIGGER, "sm:w-56")}
                >
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value={ALL}>{text.reason_all}</Select.Item>
                  {CANCELLATION_CATEGORIES.map((reason) => (
                    <Select.Item key={reason} value={reason}>
                      {text[`reason_${reason}`]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </>
        )}
        {hasFilters(query) && (
          <Button
            type="button"
            variant="transparent"
            className="text-ui-fg-subtle hover:text-ui-fg-base min-h-11 self-start px-3 motion-safe:animate-fade-in"
            onClick={() => {
              searchRef.current = ""
              setSearch("")
              go({
                q: undefined,
                period: undefined,
                cancellation_category: undefined,
              })
              document.getElementById("order-search")?.focus()
            }}
          >
            {text.clear_filters}
          </Button>
        )}
      </div>
      {isHistory && query.period === "custom" && (
        <fieldset className="flex flex-col gap-3 sm:flex-row sm:items-end motion-safe:animate-fade-in">
          <legend className="sr-only">{text.period_custom}</legend>
          {(["from", "to"] as const).map((bound) => (
            <div key={bound} className="flex flex-col gap-1">
              <Label htmlFor={`order-${bound}`} size="small" weight="plus">
                {text[`date_${bound}`]}
              </Label>
              <Input
                id={`order-${bound}`}
                name={bound}
                type="date"
                defaultValue={query[bound] ?? ""}
                aria-invalid={isRangeInvalid}
                aria-describedby={isRangeInvalid ? RANGE_ERROR_ID : undefined}
                className="[&_input]:min-h-11 sm:w-48"
                onChange={(event) => {
                  // Typing a date fires on every digit of the year, so it
                  // waits like the search; both dates travel together.
                  datesRef.current = {
                    ...datesRef.current,
                    [bound]: event.target.value || undefined,
                  }
                  later(() => go(datesRef.current))
                }}
              />
            </div>
          ))}
        </fieldset>
      )}
      <Text
        id={RANGE_ERROR_ID}
        size="small"
        role="status"
        className={clx("text-ui-fg-error", !isRangeInvalid && "hidden")}
      >
        {isRangeInvalid ? text.date_range_invalid : ""}
      </Text>
    </form>
  )
}
