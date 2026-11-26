import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Cash,
  Clock,
  ExclamationCircle,
  InformationCircleSolid,
} from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  DataTable,
  Heading,
  Label,
  Select,
  StatusBadge,
  Text,
  Tooltip,
  clx,
  createDataTableColumnHelper,
  createDataTableFilterHelper,
  useDataTable,
  type DataTableFilteringState,
  type DataTablePaginationState,
  type DataTableSortingState,
} from "@medusajs/ui"
import { FetchError } from "@medusajs/js-sdk"
import { Spinner } from "@medusajs/icons"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { Link, useSearchParams } from "react-router-dom"
import { sdk } from "../../lib/restaurant-api"
import {
  completenessLabels,
  currentCopenhagenMonth,
  formatAmount,
  formatMonth,
  isStatementMonth,
  lifecycleLabels,
  reasonLabel,
  type StatementHeader,
  type StatementTotal,
} from "../../lib/statement-api"
import {
  TREND_MONTHS,
  amountOf,
  earningsLabels,
  type EarningsMonth,
  type EarningsMonths,
  type EarningsSummary,
  type RestaurantEarnings,
} from "../../lib/earnings-api"
import { useFeatureFlag } from "../../lib/use-feature-flag"

/** Long names wrap instead of widening the page. */
const WRAP_CLASSES = "min-w-0 break-words [overflow-wrap:anywhere]"
const LINK_CLASSES =
  "text-ui-fg-interactive hover:text-ui-fg-interactive-hover rounded focus-visible:shadow-borders-focus outline-none"
/** The two earnings segments; each also has its name in the legend and labels. */
const COMMISSION_FILL = "bg-ui-fg-interactive"
const SERVICE_FEE_FILL = "bg-ui-tag-purple-icon"

function Loading({ label }: Readonly<{ label: string }>) {
  return (
    <div role="status" className="flex items-center gap-2 px-6 py-4">
      <Spinner className="animate-spin text-ui-fg-subtle" />
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
    </div>
  )
}

function Retry({
  message,
  onRetry,
}: Readonly<{ message: string; onRetry: () => void }>) {
  return (
    <Alert variant="error" className="flex flex-col gap-2">
      <Text size="small">{message}</Text>
      <div>
        <Button size="small" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Alert>
  )
}

/** Lifecycle and completeness in words, never by colour alone. */
function StateBadges({
  state,
}: Readonly<{ state: Pick<StatementHeader, "lifecycle" | "completeness"> }>) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge color={state.lifecycle === "closed" ? "grey" : "blue"}>
        {lifecycleLabels[state.lifecycle]}
      </StatusBadge>
      <StatusBadge
        color={state.completeness === "complete" ? "green" : "orange"}
      >
        {completenessLabels[state.completeness]}
      </StatusBadge>
    </span>
  )
}

/** An exact amount, or why it is withheld: unavailable is never zero. */
function Amount({
  total,
  isEmphasized = false,
}: Readonly<{ total: StatementTotal; isEmphasized?: boolean }>) {
  if (total.status === "unavailable")
    return (
      <span className="flex flex-col">
        <Text size="small" weight="plus">
          Withheld
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle">
          {reasonLabel(total.reason)}
        </Text>
      </span>
    )
  return (
    <Text
      size={isEmphasized ? "xlarge" : "small"}
      weight={isEmphasized ? "plus" : "regular"}
      className={clx(WRAP_CLASSES, "tabular-nums")}
    >
      {formatAmount(total.amount)}
    </Text>
  )
}

/** A clean axis top: 1, 1.5, 2, 2.5 or 5 times a power of ten, at or above `value`. */
const niceCeiling = (value: number) => {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 1.5, 2, 2.5, 5, 10].find(
    (factor) => value <= factor * power,
  )!
  return step * power
}
const WHOLE_DKK = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 })
const SHORT_MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
})
const shortMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number)
  return SHORT_MONTH.format(new Date(Date.UTC(year, number - 1, 1)))
}

const isWithheld = (summary: EarningsSummary) =>
  summary.totals.earnings.status === "unavailable"

/** A month's bar in words, for screen readers and the table view. */
const describeMonth = (summary: EarningsSummary) => {
  const text = (total: StatementTotal) =>
    total.status === "available"
      ? formatAmount(total.amount)
      : `withheld (${reasonLabel(total.reason).toLowerCase()})`
  return [
    formatMonth(summary.month),
    `${earningsLabels.commission} ${text(summary.totals.commission)}`,
    `${earningsLabels.service_fee} ${text(summary.totals.service_fee)}`,
    `${earningsLabels.earnings} ${text(summary.totals.earnings)}`,
    lifecycleLabels[summary.lifecycle],
    completenessLabels[summary.completeness],
  ].join(", ")
}

/**
 * Stacks a bar's signed segments from zero: positive ones upwards, negative
 * ones downwards, each starting where the previous one in its direction ended.
 */
function stackSegments(parts: { fill: string; amount: number }[]) {
  let up = 0
  let down = 0
  const segments = parts.flatMap(({ fill, amount }) => {
    if (amount === 0) return []
    if (amount > 0) {
      up += amount
      return [{ fill, from: up - amount, size: amount }]
    }
    down -= amount
    return [{ fill, from: -down, size: -amount }]
  })
  return { up, down, segments }
}

/**
 * The monthly trend (#256): one stacked bar per month, commission below and
 * service fee above, oldest on the left. A provisional month is drawn lighter
 * with a clock mark; a month with a withheld total has a dashed outline and a
 * warning mark, and only its known segments. Each bar is a button that selects
 * its month; the table view carries every value.
 */
function TrendChart({
  months,
  selected,
  onSelect,
}: Readonly<{
  months: EarningsSummary[]
  selected: string
  onSelect: (month: string) => void
}>) {
  const ordered = [...months].reverse()
  // Geometry only. Positive segments stack up from zero, negative ones (a
  // month whose reversals exceed its commission) down, so every bar matches
  // its signed totals; a withheld segment is not drawn.
  const bars = ordered.map((summary) =>
    stackSegments([
      {
        fill: COMMISSION_FILL,
        amount: amountOf(summary.totals.commission) ?? 0,
      },
      {
        fill: SERVICE_FEE_FILL,
        amount: amountOf(summary.totals.service_fee) ?? 0,
      },
    ]),
  )
  const top = niceCeiling(Math.max(...bars.map(({ up }) => up), 0))
  const deepest = Math.max(...bars.map(({ down }) => down), 0)
  const bottom = deepest > 0 ? niceCeiling(deepest) : 0
  const range = top + bottom
  /** Distance from the plot's bottom edge, as a percentage. */
  const at = (amount: number) => `${((amount + bottom) / range) * 100}%`
  const span = (amount: number) => `${(amount / range) * 100}%`
  const ticks = [top, top / 2, 0, ...(bottom ? [-bottom] : [])]
  const columns = {
    // Capped, so a few months do not stretch across the whole plot.
    gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 5rem))`,
  }
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = Math.max(
    0,
    ordered.findIndex(({ month }) => month === selected),
  )
  /** One Tab stop: arrows, Home and End move between months and select. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = ordered.length - 1
    const next = {
      ArrowLeft: Math.max(0, selectedIndex - 1),
      ArrowRight: Math.min(last, selectedIndex + 1),
      Home: 0,
      End: last,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onSelect(ordered[next].month)
    buttons.current[next]?.focus()
  }
  return (
    <section aria-labelledby="earnings-trend" className="space-y-3 px-6 py-4">
      <div className="space-y-1">
        <Heading level="h2" id="earnings-trend">
          Monthly trend
        </Heading>
        <Text size="small" className="text-ui-fg-subtle max-w-prose">
          Commission and service fee per month, DKK excl. VAT. Select a month to
          see its summary and Restaurants.
        </Text>
      </div>
      <figure aria-label="MTOGO earnings per month" className="space-y-2">
        <div className="flex gap-2">
          <div
            aria-hidden="true"
            className="txt-compact-xsmall text-ui-fg-muted relative h-44 w-12 shrink-0 text-right tabular-nums"
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 translate-y-1/2"
                style={{ bottom: at(tick) }}
              >
                {WHOLE_DKK.format(tick).replace(/^-/, "\u2212")}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-44">
              {ticks.map((tick) => (
                <div
                  key={tick}
                  aria-hidden="true"
                  className={clx(
                    "pointer-events-none absolute inset-x-0 border-t",
                    tick === 0
                      ? "border-ui-border-strong"
                      : "border-ui-border-base",
                  )}
                  style={{ bottom: at(tick) }}
                />
              ))}
              <div
                role="radiogroup"
                aria-label="Month"
                onKeyDown={onKeyDown}
                className="relative grid h-full gap-1"
                style={columns}
              >
                {ordered.map((summary, index) => {
                  const isSelected = summary.month === selected
                  const isWithheldMonth = isWithheld(summary)
                  return (
                    <div key={summary.month} className="flex h-full">
                      <button
                        ref={(element) => {
                          buttons.current[index] = element
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={index === selectedIndex ? 0 : -1}
                        aria-label={describeMonth(summary)}
                        onClick={() => onSelect(summary.month)}
                        className={clx(
                          "focus-visible:shadow-borders-focus flex h-full w-full justify-center rounded-md outline-none",
                          // Touch screens would leave a tapped bar looking hovered.
                          "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-ui-bg-base-hover",
                          isSelected && "bg-ui-bg-highlight",
                          isWithheldMonth &&
                            "border-ui-border-strong border border-dashed",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={clx(
                            "relative h-full w-[60%] max-w-8",
                            summary.lifecycle === "provisional" && "opacity-50",
                          )}
                        >
                          {bars[index].segments.map((segment) => (
                            <span
                              key={segment.fill}
                              className={clx(
                                segment.fill,
                                "absolute inset-x-0",
                              )}
                              style={{
                                bottom: at(segment.from),
                                height: span(segment.size),
                              }}
                            />
                          ))}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div
              aria-hidden="true"
              className="txt-compact-xsmall mt-1 grid gap-1 tabular-nums"
              style={columns}
            >
              {ordered.map((summary) => (
                <span
                  key={summary.month}
                  className={clx(
                    "flex flex-col items-center gap-0.5",
                    summary.month === selected
                      ? "text-ui-fg-base font-medium"
                      : "text-ui-fg-muted",
                  )}
                >
                  <span>{shortMonth(summary.month)}</span>
                  <span className="flex h-4 items-center">
                    {isWithheld(summary) ? (
                      <ExclamationCircle className="text-ui-fg-subtle size-4" />
                    ) : (
                      summary.lifecycle === "provisional" && (
                        <Clock className="text-ui-fg-subtle size-4" />
                      )
                    )}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="txt-compact-xsmall text-ui-fg-subtle ml-14 flex flex-wrap gap-x-4 gap-y-1"
        >
          <span className="flex items-center gap-1.5">
            <span className={clx(COMMISSION_FILL, "size-2 rounded-sm")} />
            {earningsLabels.commission}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={clx(SERVICE_FEE_FILL, "size-2 rounded-sm")} />
            {earningsLabels.service_fee}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" />
            Provisional, still open
          </span>
          <span className="flex items-center gap-1.5">
            <ExclamationCircle className="size-4" />A total is withheld
          </span>
        </div>
      </figure>
      <details>
        <summary
          className={clx(
            LINK_CLASSES,
            "txt-compact-small-plus w-fit cursor-pointer",
          )}
        >
          Show the trend as a table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="txt-compact-small w-full min-w-[36rem] tabular-nums">
            <thead>
              <tr className="txt-compact-small-plus text-ui-fg-subtle text-left">
                <th scope="col" className="py-2 pr-3">
                  Month
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {earningsLabels.commission}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {earningsLabels.service_fee}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {earningsLabels.earnings}
                </th>
                <th scope="col" className="py-2">
                  State
                </th>
              </tr>
            </thead>
            <tbody className="divide-ui-border-base divide-y">
              {months.map((summary) => (
                <tr key={summary.month}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {formatMonth(summary.month)}
                  </th>
                  {(["commission", "service_fee", "earnings"] as const).map(
                    (key) => (
                      <td key={key} className="py-1.5 pr-3 text-right">
                        {summary.totals[key].status === "available"
                          ? formatAmount(
                              (summary.totals[key] as { amount: string })
                                .amount,
                            )
                          : "Withheld"}
                      </td>
                    ),
                  )}
                  <td className="text-ui-fg-subtle py-1.5">
                    {lifecycleLabels[summary.lifecycle]} ·{" "}
                    {completenessLabels[summary.completeness]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/** The selected month's totals across all Restaurants. */
/** An explanation behind an info icon, reachable by keyboard too. */
function About({ label, text }: Readonly<{ label: string; text: string }>) {
  return (
    <Tooltip content={text} maxWidth={280}>
      <button
        type="button"
        aria-label={`About ${label}: ${text}`}
        className="text-ui-fg-muted hover:text-ui-fg-subtle focus-visible:shadow-borders-focus inline-flex rounded-full align-text-bottom outline-none"
      >
        <InformationCircleSolid />
      </button>
    </Tooltip>
  )
}

/** Named in the warning before "and N more" points at the table. */
const NAMED_RESTAURANTS = 5

function Summary({
  summary,
  onShowIncomplete,
}: Readonly<{ summary: EarningsSummary; onShowIncomplete: () => void }>) {
  const withheld = summary.withheld_restaurants
  const unnamed = withheld.length - NAMED_RESTAURANTS
  const facts: {
    label: string
    about?: string
    value: ReactNode
  }[] = [
    {
      label: `${earningsLabels.earnings} excl. VAT`,
      about:
        "Commission plus service fee, added up from every Restaurant's statement for the month. Adjustments of earlier months stay on each statement.",
      value: <Amount total={summary.totals.earnings} isEmphasized />,
    },
    {
      label: `${earningsLabels.commission} excl. VAT`,
      value: <Amount total={summary.totals.commission} />,
    },
    {
      label: `${earningsLabels.service_fee} excl. VAT`,
      value: <Amount total={summary.totals.service_fee} />,
    },
    {
      label: `${earningsLabels.mtogo_funded_food_credits} excl. VAT`,
      about:
        "Prepared-food compensation MTOGO pays the Restaurants. A cost, not part of earnings.",
      value: <Amount total={summary.totals.mtogo_funded_food_credits} />,
    },
    {
      label: "Restaurants",
      about:
        "Restaurants with a statement this month, active or not. Each one's share is in the table below.",
      value: (
        <Text size="small" className="tabular-nums">
          {summary.restaurant_count}
        </Text>
      ),
    },
  ]
  return (
    <section aria-labelledby="earnings-summary" className="space-y-4 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h2" id="earnings-summary">
          {formatMonth(summary.month)}
        </Heading>
        <StateBadges state={summary} />
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {facts.map(({ label, about, value }) => (
          <div key={label} className="min-w-0 space-y-1">
            <dt>
              {/* The icon follows the label's last word, even when it wraps. */}
              <Text size="small" className="text-ui-fg-subtle">
                {label}
                {about && (
                  <>
                    {"\u00a0"}
                    <About label={label} text={about} />
                  </>
                )}
              </Text>
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {withheld.length > 0 && (
        <Alert variant="warning" className="space-y-2">
          <Text size="small">
            These Restaurants' statements are not complete. A total they
            withhold is withheld here too:
          </Text>
          <ul className="list-disc space-y-1 pl-5">
            {withheld
              .slice(0, NAMED_RESTAURANTS)
              .map(({ restaurant, completeness }) => (
                <li key={restaurant.id} className={WRAP_CLASSES}>
                  <Text size="small">
                    <Link
                      className={LINK_CLASSES}
                      to={`/restaurants/${restaurant.id}/statements?month=${summary.month}`}
                    >
                      {restaurant.name}
                    </Link>{" "}
                    · {completenessLabels[completeness]}
                  </Text>
                </li>
              ))}
          </ul>
          {unnamed > 0 && (
            <Text size="small">
              and {unnamed} more.{" "}
              <button
                type="button"
                onClick={onShowIncomplete}
                className={clx(LINK_CLASSES, "txt-compact-small-plus")}
              >
                Show all {withheld.length} in the table
              </button>
            </Text>
          )}
        </Alert>
      )}
    </section>
  )
}

const PAGE_SIZE = 20
const NOT_COMPLETE = ["incomplete", "processing_pending"]
/** The month's Restaurants, most earning first unless sorted otherwise. */
const DEFAULT_SORTING: DataTableSortingState = { id: "earnings", desc: true }

const helper = createDataTableColumnHelper<RestaurantEarnings>()
const amountColumn = (key: keyof RestaurantEarnings["totals"]) =>
  helper.accessor((row) => row.totals[key], {
    id: key,
    header: earningsLabels[key],
    enableSorting: true,
    sortAscLabel: "Lowest first",
    sortDescLabel: "Highest first",
    cell: ({ row }) => <Amount total={row.original.totals[key]} />,
  })
const filters = [
  createDataTableFilterHelper<RestaurantEarnings>().accessor("completeness", {
    type: "multiselect",
    label: "Completeness",
    options: (["complete", "incomplete", "processing_pending"] as const).map(
      (value) => ({ label: completenessLabels[value], value }),
    ),
  }),
]

/** The API's `order`: a column, descending with a leading `-`. */
const orderOf = (sorting: DataTableSortingState) =>
  `${sorting.desc ? "-" : ""}${sorting.id === "restaurant" ? "name" : sorting.id}`

function Breakdown({
  month,
  result,
  isUpdating,
  table: state,
}: Readonly<{
  month: string
  result: EarningsMonth
  isUpdating: boolean
  table: ReturnType<typeof useRestaurantTable>
}>) {
  const columns = useMemo(
    () => [
      helper.accessor((row) => row.restaurant.name, {
        id: "restaurant",
        header: "Restaurant",
        enableSorting: true,
        sortAscLabel: "A to Z",
        sortDescLabel: "Z to A",
        cell: ({ row }) => (
          <Link
            className={clx(
              LINK_CLASSES,
              WRAP_CLASSES,
              "block min-w-36 max-w-64 whitespace-normal py-2",
            )}
            to={`/restaurants/${row.original.restaurant.id}`}
          >
            {row.original.restaurant.name}
          </Link>
        ),
      }),
      amountColumn("earnings"),
      amountColumn("commission"),
      amountColumn("service_fee"),
      amountColumn("mtogo_funded_food_credits"),
      helper.accessor("completeness", {
        // Every row shares the month's lifecycle, shown in the summary.
        header: "Completeness",
        cell: ({ row }) => (
          <StatusBadge
            color={
              row.original.completeness === "complete" ? "green" : "orange"
            }
          >
            {completenessLabels[row.original.completeness]}
          </StatusBadge>
        ),
      }),
      helper.display({
        id: "statement",
        header: "Statement",
        cell: ({ row }) => (
          <Link
            className={LINK_CLASSES}
            to={`/restaurants/${row.original.restaurant.id}/statements?month=${month}`}
          >
            View statement
            <span className="sr-only">
              {" "}
              of {row.original.restaurant.name} for {formatMonth(month)}
            </span>
          </Link>
        ),
      }),
    ],
    [month],
  )
  const table = useDataTable({
    data: result.restaurants,
    columns,
    filters,
    getRowId: (row) => row.restaurant.id,
    rowCount: result.count,
    isLoading: isUpdating,
    search: {
      state: state.search,
      onSearchChange: state.setSearch,
      debounce: 300,
    },
    sorting: { state: state.sorting, onSortingChange: state.setSorting },
    filtering: {
      state: state.filtering,
      onFilteringChange: state.setFiltering,
    },
    pagination: {
      state: state.pagination,
      onPaginationChange: state.setPagination,
    },
  })
  return (
    <Container className="p-0">
      <section aria-labelledby="earnings-restaurants" className="py-4">
        <div className="px-6 pb-3">
          <Heading level="h2" id="earnings-restaurants">
            Restaurants
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Each row is that Restaurant's statement for {formatMonth(month)}, in
            DKK excluding VAT.
          </Text>
        </div>
        <div className="overflow-x-auto">
          <DataTable instance={table}>
            <DataTable.Toolbar className="flex flex-wrap gap-2">
              <DataTable.FilterMenu tooltip="Filter" />
              <DataTable.Search placeholder="Search Restaurants" />
              <DataTable.SortingMenu tooltip="Sort" />
            </DataTable.Toolbar>
            <DataTable.Table
              emptyState={{
                empty: { heading: "No Restaurant had a statement this month" },
                filtered: { heading: "No Restaurant matches" },
              }}
            />
            <DataTable.Pagination />
          </DataTable>
        </div>
      </section>
    </Container>
  )
}

/** Sorting, search, filter and page of the table; each change starts on page 1. */
function useRestaurantTable(month: string) {
  const [sorting, setSortingState] =
    useState<DataTableSortingState>(DEFAULT_SORTING)
  const [search, setSearchState] = useState("")
  const [filtering, setFilteringState] = useState<DataTableFilteringState>({})
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const firstPage = () => setPagination((page) => ({ ...page, pageIndex: 0 }))
  // Another month starts on its first page; sorting, search and filter stay.
  const [shownMonth, setShownMonth] = useState(month)
  if (shownMonth !== month) {
    setShownMonth(month)
    firstPage()
  }
  const completeness = filtering.completeness as string[] | undefined
  return {
    sorting,
    search,
    filtering,
    pagination,
    setPagination,
    // A third click on a sorted column clears it (`undefined`): fall back to
    // the default, most earning first, rather than an unsorted table.
    setSorting: (next: DataTableSortingState | undefined) => {
      setSortingState(next ?? DEFAULT_SORTING)
      firstPage()
    },
    setSearch: (next: string) => {
      setSearchState(next)
      firstPage()
    },
    setFiltering: (next: DataTableFilteringState) => {
      setFilteringState(next)
      firstPage()
    },
    showNotComplete: () => {
      setFilteringState({ completeness: NOT_COMPLETE })
      firstPage()
    },
    query: {
      order: orderOf(sorting),
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(completeness?.length ? { completeness: completeness.join(",") } : {}),
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    },
  }
}

const isNotFound = (error: unknown) =>
  error instanceof FetchError && error.status === 404

function MonthBody({ month }: Readonly<{ month: string }>) {
  const table = useRestaurantTable(month)
  const detail = useQuery({
    queryKey: ["admin-earnings", month, table.query],
    queryFn: () =>
      sdk.client.fetch<EarningsMonth>(`/admin/earnings/${month}`, {
        query: table.query,
      }),
    // Keep the shown month while the next month or page loads.
    placeholderData: keepPreviousData,
  })
  if (detail.isPending)
    return (
      <Container className="p-0">
        <Loading label="Loading the month's earnings…" />
      </Container>
    )
  if (isNotFound(detail.error))
    return (
      <Container>
        <Text size="small">
          There are no earnings for {formatMonth(month)}.
        </Text>
      </Container>
    )
  if (detail.error)
    return (
      <Container>
        <Retry
          message="Could not load the month's earnings."
          onRetry={() => void detail.refetch()}
        />
      </Container>
    )
  // Another month's data stays dimmed until this month's arrives.
  const isOtherMonth = detail.data.earnings.month !== month
  return (
    <div
      aria-busy={detail.isPlaceholderData}
      className={clx(
        "flex flex-col gap-y-3 transition-opacity duration-150 ease-out",
        isOtherMonth && "opacity-60",
      )}
    >
      <Container className="p-0">
        <Summary
          summary={detail.data.earnings}
          onShowIncomplete={() => {
            table.showNotComplete()
            document
              .getElementById("earnings-restaurants")
              ?.scrollIntoView({ block: "start" })
          }}
        />
      </Container>
      <Breakdown
        month={detail.data.earnings.month}
        result={detail.data}
        isUpdating={detail.isPlaceholderData && !isOtherMonth}
        table={table}
      />
    </div>
  )
}

function MonthPicker({
  month,
  months,
  onChange,
}: Readonly<{
  month: string
  months: EarningsSummary[]
  onChange: (month: string) => void
}>) {
  const labelId = useId()
  const values = months.some((summary) => summary.month === month)
    ? months.map((summary) => summary.month)
    : [month, ...months.map((summary) => summary.month)]
  return (
    <div className="w-full space-y-1 sm:w-72">
      <Label id={labelId} size="small" weight="plus">
        Month
      </Label>
      <Select size="small" value={month} onValueChange={onChange}>
        <Select.Trigger aria-labelledby={labelId}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {values.map((value) => (
            <Select.Item key={value} value={value}>
              {formatMonth(value)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  )
}

/**
 * What MTOGO earned across all Restaurants (#256), for operators: a monthly
 * trend, the selected month's totals and each Restaurant's share, linking to
 * its statement. Shown only while the backend releases statements.
 */
const EarningsPage = () => {
  const [params, setParams] = useSearchParams()
  const requested = params.get("month")
  const month = isStatementMonth(requested)
    ? requested
    : currentCopenhagenMonth()
  const flags = useFeatureFlag("restaurant_statements")
  const months = useQuery({
    queryKey: ["admin-earnings-months"],
    queryFn: () =>
      sdk.client.fetch<EarningsMonths>("/admin/earnings", {
        query: { limit: TREND_MONTHS, offset: 0 },
      }),
    enabled: flags.isReleased,
  })
  // Each selection is a history entry, so Back returns to the earlier month.
  const select = (value: string) => setParams({ month: value })

  if (flags.isLoading) return <Loading label="Loading Earnings…" />
  if (flags.error)
    return (
      <Retry
        message="Could not load Feature flags."
        onRetry={() => void flags.refetch()}
      />
    )
  if (!flags.isReleased)
    return (
      <Container>
        <Heading>Earnings</Heading>
        <Text>Restaurant statements are not released yet.</Text>
      </Container>
    )
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-4">
          <div className="min-w-0 space-y-1">
            <Heading>Earnings</Heading>
            <Text size="small" className="text-ui-fg-subtle max-w-prose">
              What MTOGO earned across all Restaurants per Copenhagen month, in
              DKK excluding VAT, added up from the Restaurants' statements. Not
              a tax invoice or a payout.
            </Text>
          </div>
          <MonthPicker
            month={month}
            months={months.data?.months ?? []}
            onChange={select}
          />
        </div>
        {months.isPending && <Loading label="Loading the monthly trend…" />}
        {months.error && (
          <div className="px-6 py-4">
            <Retry
              message="Could not load the monthly trend."
              onRetry={() => void months.refetch()}
            />
          </div>
        )}
        {months.data && months.data.months.length > 0 && (
          <TrendChart
            months={months.data.months}
            selected={month}
            onSelect={select}
          />
        )}
      </Container>
      <MonthBody month={month} />
    </div>
  )
}

export const config = defineRouteConfig({ label: "Earnings", icon: Cash })

export default EarningsPage
