import Link from "next/link"
import {
  formatExactDkk,
  formatExactPercent,
  formatOrderDateTime,
  formatStatementMonth,
  formatText,
  RESTAURANT_STATEMENTS_TEXT,
  statementProblemText,
  type Locale,
} from "@dtc/i18n"
import { Badge, Container, Heading, Text, clx } from "@medusajs/ui"
import type {
  Statement,
  StatementComponent,
  StatementEntry,
  StatementHeader,
  StatementTotal,
} from "@lib/data/statements"
import {
  STATEMENT_PAGE_SIZE,
  statementHref,
  type StatementQuery,
} from "@lib/statement-query"

type Text = (typeof RESTAURANT_STATEMENTS_TEXT)["da"]

/** Medusa UI's secondary button, as a link. */
export const LINK_BUTTON =
  "bg-ui-button-neutral text-ui-fg-base shadow-buttons-neutral hover:bg-ui-button-neutral-hover active:bg-ui-button-neutral-pressed focus-visible:ring-mtogo-focus-ring txt-compact-small-plus ease-out-strong inline-flex min-h-11 items-center justify-center rounded-md px-4 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:active:scale-[0.97]"

/** Long names and references wrap instead of widening the page. */
const WRAP = "min-w-0 break-words [overflow-wrap:anywhere]"

/** Exact amounts in DKK; another currency is shown as the backend sent it. */
const money = (amount: string, currency: string, locale: Locale) =>
  currency === "dkk"
    ? formatExactDkk(amount, locale)
    : `${currency.toUpperCase()} ${amount}`

const reasonText = (text: Text, reason: string) =>
  (text as Record<string, string>)[`reason_${reason}`] ?? text.unavailable

/** The month's state in words, never by colour alone. */
export function StatementBadges({
  header,
  locale,
}: {
  header: Pick<StatementHeader, "lifecycle" | "completeness">
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  return (
    <span className="flex flex-wrap gap-2">
      <Badge
        size="small"
        color={header.lifecycle === "closed" ? "grey" : "blue"}
      >
        {text[header.lifecycle]}
      </Badge>
      <Badge
        size="small"
        color={header.completeness === "complete" ? "green" : "orange"}
      >
        {text[header.completeness]}
      </Badge>
    </span>
  )
}

const COMPONENTS: StatementComponent[] = [
  "food_credits",
  "commission",
  "service_fee",
  "adjustments",
  "balance",
]

/** Charges reduce the balance; they are labeled, not only signed. */
const DEDUCTIONS: StatementComponent[] = ["commission", "service_fee"]

function TotalValue({
  total,
  isDeduction,
  currency,
  locale,
}: {
  total: StatementTotal
  isDeduction: boolean
  currency: string
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  if (total.status === "unavailable")
    return (
      <>
        <span className="txt-compact-medium-plus text-ui-fg-base">
          {text.unavailable}
        </span>
        <span className="txt-compact-small text-ui-fg-subtle">
          {reasonText(text, total.reason)}
        </span>
      </>
    )
  return (
    <>
      <span
        className={clx(
          WRAP,
          "txt-compact-large-plus text-ui-fg-base tabular-nums",
        )}
      >
        {money(total.amount, currency, locale)}
      </span>
      {isDeduction && (
        <span className="txt-compact-small text-ui-fg-subtle">
          {text.deduction}
        </span>
      )}
    </>
  )
}

/** The five whole-month totals, the same on every page of entries. */
export function StatementTotals({
  header,
  locale,
}: {
  header: StatementHeader
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  return (
    <section aria-labelledby="statement-totals" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading level="h2" id="statement-totals">
          {text.totals}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {text.amounts_basis}
        </Text>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {COMPONENTS.map((component) => (
          <div
            key={component}
            className={clx(
              "rounded-card bg-ui-bg-base shadow-borders-base flex min-w-0 flex-col gap-1 px-4 py-3",
              component === "balance" && "sm:col-span-2 xl:col-span-1",
            )}
          >
            <dt className="txt-compact-small text-ui-fg-subtle">
              {text[component]}
            </dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <TotalValue
                total={header.totals[component]}
                isDeduction={DEDUCTIONS.includes(component)}
                currency={header.currency_code}
                locale={locale}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** What withholds amounts: missing evidence or processing still owed. */
export function StatementProblems({
  header,
  locale,
}: {
  header: StatementHeader
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  if (!header.problems.length) return null
  return (
    <Container className="rounded-card flex flex-col gap-2 px-4 py-4 sm:px-6">
      <Heading level="h2">{text.problems}</Heading>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {header.problems.map((problem) => (
          <li key={problem.code} className={clx(WRAP, "txt-compact-small")}>
            {statementProblemText(problem, locale)}
          </li>
        ))}
      </ul>
    </Container>
  )
}

function OrderReference({
  entry,
  locale,
}: {
  entry: StatementEntry
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  if (!entry.order) return <>{text.entry_order_unknown}</>
  return (
    <Link
      href={`/orders/${encodeURIComponent(entry.order.id)}`}
      className={clx(
        WRAP,
        "text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:ring-mtogo-focus-ring txt-compact-small-plus rounded focus-visible:outline-none focus-visible:ring-2",
      )}
    >
      {entry.order.display_id === null
        ? text.entry_order_unknown
        : formatText(text.entry_order_number, {
            number: entry.order.display_id,
          })}
    </Link>
  )
}

function Calculation({
  entry,
  locale,
}: {
  entry: StatementEntry
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const calculation = entry.calculation
  if (
    !calculation?.food_value_including_vat ||
    !calculation.food_value_excluding_vat ||
    !calculation.vat_rate
  )
    return null
  return (
    <span className={clx(WRAP, "txt-compact-small text-ui-fg-subtle")}>
      {formatText(text.calculation_food_value, {
        including: formatExactDkk(calculation.food_value_including_vat, locale),
        excluding: formatExactDkk(calculation.food_value_excluding_vat, locale),
        rate: formatExactPercent(calculation.vat_rate, locale),
      })}
      {calculation.terms_version && (
        <>
          {" · "}
          {formatText(text.calculation_terms, {
            terms:
              calculation.terms_version === "common_mvp_v1"
                ? text.terms_common_mvp_v1
                : calculation.terms_version,
          })}
        </>
      )}
    </span>
  )
}

/** One page of booked entries: a table when wide, a list when narrow. */
export function StatementEntries({
  result,
  query,
  locale,
}: {
  result: Statement
  query: StatementQuery
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const currency = result.statement.currency_code
  const amount = (value: string) => money(value, currency, locale)
  const funded = (entry: StatementEntry) =>
    entry.funded_by === "mtogo"
      ? text.entry_funded_by_mtogo
      : text.entry_funded_by_customer
  const pages = Math.max(1, Math.ceil(result.count / STATEMENT_PAGE_SIZE))
  return (
    <Container className="rounded-card divide-ui-border-base divide-y overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-6">
        <Heading level="h2" id="statement-entries">
          {text.entries}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle tabular-nums">
          {formatText(text.entries_count, { count: result.count })}
        </Text>
      </div>
      {result.entries.length === 0 ? (
        <Text className="text-ui-fg-subtle px-4 py-6 sm:px-6">
          {text.entries_empty}
        </Text>
      ) : (
        <>
          <table
            aria-labelledby="statement-entries"
            className="hidden w-full table-fixed md:table"
          >
            <thead>
              <tr className="txt-compact-small-plus text-ui-fg-subtle text-left">
                <th scope="col" className="w-[40%] px-6 py-3">
                  {text.entry_order}
                </th>
                <th scope="col" className="px-3 py-3">
                  {text.entry_delivered}
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  {text.entry_food_credit}
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  {text.entry_commission}
                </th>
                <th scope="col" className="px-6 py-3 text-right">
                  {text.entry_net}
                </th>
              </tr>
            </thead>
            <tbody className="divide-ui-border-base divide-y">
              {result.entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="px-6 py-3">
                    <span className="flex min-w-0 flex-col gap-1">
                      <OrderReference entry={entry} locale={locale} />
                      <span className="txt-compact-small text-ui-fg-subtle">
                        {funded(entry)}
                      </span>
                      <Calculation entry={entry} locale={locale} />
                    </span>
                  </td>
                  <td className="txt-compact-small px-3 py-3">
                    <span className="flex flex-col gap-1">
                      <span>
                        {formatOrderDateTime(entry.occurred_at, locale)}
                      </span>
                      <span className="text-ui-fg-subtle">
                        {text.entry_posted}{" "}
                        {formatOrderDateTime(entry.posted_at, locale)}
                      </span>
                    </span>
                  </td>
                  <td className="txt-compact-small px-3 py-3 text-right tabular-nums">
                    {amount(entry.amounts.food_credit)}
                  </td>
                  <td className="txt-compact-small px-3 py-3 text-right tabular-nums">
                    {amount(entry.amounts.commission)}
                  </td>
                  <td className="txt-compact-small-plus px-6 py-3 text-right tabular-nums">
                    {amount(entry.amounts.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul
            aria-labelledby="statement-entries"
            className="divide-ui-border-base divide-y md:hidden"
          >
            {result.entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 px-4 py-4">
                <OrderReference entry={entry} locale={locale} />
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
                  <dt className="txt-compact-small text-ui-fg-subtle">
                    {text.entry_delivered}
                  </dt>
                  <dd className="txt-compact-small text-right">
                    {formatOrderDateTime(entry.occurred_at, locale)}
                  </dd>
                  <dt className="txt-compact-small text-ui-fg-subtle">
                    {text.entry_posted}
                  </dt>
                  <dd className="txt-compact-small text-right">
                    {formatOrderDateTime(entry.posted_at, locale)}
                  </dd>
                  <dt className="txt-compact-small text-ui-fg-subtle">
                    {text.entry_food_credit}
                  </dt>
                  <dd className="txt-compact-small text-right tabular-nums">
                    {amount(entry.amounts.food_credit)}
                  </dd>
                  <dt className="txt-compact-small text-ui-fg-subtle">
                    {text.entry_commission}
                  </dt>
                  <dd className="txt-compact-small text-right tabular-nums">
                    {amount(entry.amounts.commission)}
                  </dd>
                  <dt className="txt-compact-small-plus">{text.entry_net}</dt>
                  <dd className="txt-compact-small-plus text-right tabular-nums">
                    {amount(entry.amounts.net)}
                  </dd>
                </dl>
                <span className="txt-compact-small text-ui-fg-subtle">
                  {funded(entry)}
                </span>
                <Calculation entry={entry} locale={locale} />
              </li>
            ))}
          </ul>
        </>
      )}
      {result.count > 0 && (
        <nav
          aria-label={text.pagination}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
        >
          <Text size="small" className="text-ui-fg-subtle tabular-nums">
            {formatText(text.page_status, {
              from: Math.min(result.offset + 1, result.count),
              to: Math.min(result.offset + result.entries.length, result.count),
              count: result.count,
            })}
          </Text>
          {pages > 1 && (
            <div className="flex flex-wrap gap-3">
              {query.page > 1 && (
                <Link
                  href={statementHref({ ...query, page: query.page - 1 })}
                  className={LINK_BUTTON}
                >
                  {text.previous}
                </Link>
              )}
              {query.page < pages && (
                <Link
                  href={statementHref({ ...query, page: query.page + 1 })}
                  className={LINK_BUTTON}
                >
                  {text.next}
                </Link>
              )}
            </div>
          )}
        </nav>
      )}
    </Container>
  )
}

/** Month choice as a plain GET form, so it works by keyboard and without JS. */
export function MonthPicker({
  months,
  selected,
  locale,
}: {
  months: string[]
  selected: string
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const options = months.includes(selected) ? months : [selected, ...months]
  return (
    <form
      action="/statements"
      method="get"
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="txt-compact-small-plus">{text.month}</span>
        <select
          name="month"
          defaultValue={selected}
          className="bg-ui-bg-field shadow-borders-base txt-compact-small focus-visible:ring-mtogo-focus-ring min-h-11 rounded-md px-3 focus-visible:outline-none focus-visible:ring-2"
        >
          {options.map((month) => (
            <option key={month} value={month}>
              {formatStatementMonth(month, locale)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={LINK_BUTTON}>
        {text.show_month}
      </button>
    </form>
  )
}
