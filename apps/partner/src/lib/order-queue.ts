/**
 * The Orders page address: which view, page and filters staff chose, kept in
 * the URL so every result has its own link and survives a reload or a live
 * refresh. Free of React, Next.js and `server-only`, so it is tested directly.
 *
 * Days are the Restaurant's Copenhagen calendar days, computed on the server
 * when the page renders, never from the browser's clock.
 */
export const ORDER_VIEWS = ["awaiting", "active", "history"] as const
export type OrderView = (typeof ORDER_VIEWS)[number]

export const PERIODS = ["today", "yesterday", "7d", "30d", "custom"] as const
export type Period = (typeof PERIODS)[number]

export const CANCELLATION_CATEGORIES = [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
  "unassigned_timeout",
] as const
export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number]

export type QueueQuery = {
  view: OrderView
  page: number
  /** The searched Order number, digits only. */
  q?: string
  /** History only. */
  period?: Period
  /** `YYYY-MM-DD`, with the custom period only. */
  from?: string
  to?: string
  /** History only. */
  cancellation_category?: CancellationCategory
}

/** The longest Order number the backend accepts. */
const ORDER_NUMBER = /^\d{1,9}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

const oneOf = <T extends string>(values: readonly T[], value: unknown) =>
  values.includes(value as T) ? (value as T) : undefined

/** A real calendar date in `YYYY-MM-DD` form, else undefined. */
function calendarDay(value: unknown) {
  if (typeof value !== "string" || !DAY.test(value)) return undefined
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10) === value ? value : undefined
}

/**
 * What staff typed: an Order number, with or without `#`, or nothing to
 * clear the search. Anything else is `"invalid"` and is never sent.
 */
export function orderSearch(
  input: string,
): { q: string | undefined } | "invalid" {
  const value = input.trim().replace(/^#/, "").trim()
  if (!value) return { q: undefined }
  return ORDER_NUMBER.test(value) ? { q: value } : "invalid"
}

/**
 * The page's search params as a query. Unknown values are dropped rather
 * than failing the page, so an edited or outdated link still shows Orders.
 */
export function parseQueueQuery(
  params: Record<string, string | string[] | undefined>,
): QueueQuery {
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  const view = oneOf(ORDER_VIEWS, first("view")) ?? "awaiting"
  const query: QueueQuery = {
    view,
    page: Math.max(1, Math.floor(Number(first("page"))) || 1),
  }
  const search = orderSearch(first("q") ?? "")
  if (search !== "invalid" && search.q) query.q = search.q
  if (view !== "history") return query
  const period = oneOf(PERIODS, first("period"))
  if (period) query.period = period
  if (period === "custom") {
    const from = calendarDay(first("from"))
    const to = calendarDay(first("to"))
    if (from) query.from = from
    if (to) query.to = to
  }
  const category = oneOf(
    CANCELLATION_CATEGORIES,
    first("cancellation_category"),
  )
  if (category) query.cancellation_category = category
  return query
}

export const hasFilters = (query: QueueQuery) =>
  Boolean(query.q || query.period || query.cancellation_category)

/**
 * The address of the query after `change`. Any change other than the page
 * goes back to the first page, and leaving the custom period drops its dates.
 */
export function queueHref(query: QueueQuery, change: Partial<QueueQuery> = {}) {
  const next = { ...query, ...change }
  if (!("page" in change)) next.page = 1
  if (next.period !== "custom") {
    delete next.from
    delete next.to
  }
  const params = new URLSearchParams({ view: next.view })
  if (next.page > 1) params.set("page", String(next.page))
  for (const key of [
    "q",
    "period",
    "from",
    "to",
    "cancellation_category",
  ] as const) {
    const value = next[key]
    if (value) params.set(key, value)
  }
  return `/orders?${params}`
}

/** The same view without search, period or reason. */
export const withoutFilters = (query: QueueQuery) =>
  queueHref(query, {
    q: undefined,
    period: undefined,
    cancellation_category: undefined,
  })

const COPENHAGEN_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Copenhagen",
})

const COPENHAGEN_CLOCK = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Copenhagen",
})

/** Copenhagen's offset from UTC at an instant, in milliseconds. */
function copenhagenOffset(instant: number) {
  const part = Object.fromEntries(
    COPENHAGEN_CLOCK.formatToParts(new Date(instant)).map(({ type, value }) => [
      type,
      Number(value),
    ]),
  )
  const wall = Date.UTC(
    part.year,
    part.month - 1,
    part.day,
    part.hour,
    part.minute,
    part.second,
  )
  return wall - Math.floor(instant / 1000) * 1000
}

/**
 * The instant Copenhagen's calendar day begins. Summer time switches at
 * 01:00 UTC, so the offset at 00:00 UTC on that date is the one in force at
 * local midnight.
 */
function copenhagenMidnight(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  const utcMidnight = Date.UTC(year, month - 1, date)
  return new Date(utcMidnight - copenhagenOffset(utcMidnight)).toISOString()
}

function addDays(day: string, days: number) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10)
}

/**
 * The query's period as the backend's placement window: from inclusive, to
 * exclusive, on Copenhagen days. `"invalid"` when the custom end date comes
 * before its start.
 */
export function placementWindow(
  query: QueueQuery,
  now: Date,
): { placed_from?: string; placed_to?: string } | "invalid" {
  const today = COPENHAGEN_DAY.format(now)
  const days = (first: string, last: string) => ({
    placed_from: copenhagenMidnight(first),
    placed_to: copenhagenMidnight(addDays(last, 1)),
  })
  switch (query.period) {
    case "today":
      return days(today, today)
    case "yesterday":
      return days(addDays(today, -1), addDays(today, -1))
    case "7d":
      return days(addDays(today, -6), today)
    case "30d":
      return days(addDays(today, -29), today)
    case "custom": {
      const { from, to } = query
      if (from && to && to < from) return "invalid"
      return {
        ...(from && { placed_from: copenhagenMidnight(from) }),
        ...(to && { placed_to: copenhagenMidnight(addDays(to, 1)) }),
      }
    }
    default:
      return {}
  }
}
