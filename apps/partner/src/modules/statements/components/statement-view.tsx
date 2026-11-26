import { LINK_BUTTON } from "@modules/common/link-button"
import Link from "next/link"
import {
  formatExactDkk,
  formatOrderDateTime,
  formatStatementDate,
  formatStatementMonth,
  formatText,
  RESTAURANT_STATEMENTS_TEXT,
  statementOutcomeText,
  statementProblemText,
  type Locale,
} from "@dtc/i18n"
import { Badge, Container, Heading, Text, clx } from "@medusajs/ui"
import { InfoPopover } from "./info-popover"
import type {
  ServiceFeeEvidence as FeeEvidence,
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
export { LINK_BUTTON }

/** Long names and references wrap instead of widening the page. */
const WRAP = "min-w-0 break-words [overflow-wrap:anywhere]"

/** Exact amounts in DKK; another currency is shown as the backend sent it. */
const money = (amount: string, currency: string, locale: Locale) =>
  currency === "dkk"
    ? formatExactDkk(amount, locale)
    : `${currency.toUpperCase()} ${amount}`

const reasonText = (text: Text, reason: string) =>
  (text as Record<string, string>)[`reason_${reason}`] ?? text.unavailable

/**
 * The month's state in words, never by colour alone, with an information
 * button explaining what both labels mean for this month.
 */
export function StatementBadges({
  header,
  locale,
}: {
  header: Pick<StatementHeader, "lifecycle" | "completeness">
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const explain = (key: string) => (text as Record<string, string>)[key]
  return (
    <span className="flex flex-wrap items-center gap-2">
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
      <InfoPopover label={text.status_explain}>
        <Heading level="h3" className="txt-compact-medium-plus">
          {text.status_heading}
        </Heading>
        <dl className="flex flex-col gap-3">
          {[header.lifecycle, header.completeness].map((state) => (
            <div key={state} className="flex flex-col gap-0.5">
              <dt className="txt-compact-small-plus">{text[state]}</dt>
              <dd className="txt-compact-small text-ui-fg-subtle">
                {explain(`status_${state}`)}
              </dd>
            </div>
          ))}
        </dl>
        {header.completeness === "complete" &&
          header.lifecycle === "provisional" && (
            <Text size="small" className="text-ui-fg-subtle">
              {text.status_complete_not_final}
            </Text>
          )}
      </InfoPopover>
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
        {/* Charges carry a minus sign, and screen readers hear "deducted". */}
        {isDeduction && <span aria-hidden="true">−&#8202;</span>}
        {money(total.amount, currency, locale)}
        {isDeduction && <span className="sr-only"> ({text.deduction})</span>}
      </span>
    </>
  )
}

/**
 * The five whole-month totals, the same on every page of entries. The
 * service-fee card's information button opens how the fee is calculated
 * (#228).
 */
export function StatementTotals({
  header,
  serviceFee,
  locale,
}: {
  header: StatementHeader
  serviceFee?: {
    evidence: FeeEvidence
    lifecycle: StatementHeader["lifecycle"]
  }
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
              "rounded-card shadow-borders-base flex min-w-0 flex-col gap-1 px-4 py-3",
              component === "balance"
                ? "bg-mtogo-surface-selected sm:col-span-2 xl:col-span-1"
                : "bg-ui-bg-base",
            )}
          >
            <dt className="txt-compact-small text-ui-fg-subtle flex items-center gap-1">
              {text[component]}
              {component === "service_fee" && serviceFee && (
                <InfoPopover label={text.service_fee_explain}>
                  <ServiceFeeEvidence {...serviceFee} locale={locale} />
                </InfoPopover>
              )}
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

/**
 * How the month's service fee is calculated (#228), shown in the service-fee
 * card's popover: the policy amount, the active days and the month's day
 * count, so staff can reproduce it. An unknown or not yet booked fee says
 * why instead of showing a number.
 */
export function ServiceFeeEvidence({
  evidence,
  lifecycle,
  locale,
}: {
  evidence: FeeEvidence
  lifecycle: StatementHeader["lifecycle"]
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const policy = formatExactDkk(evidence.policy_amount, locale)
  const days = {
    active: evidence.active_date_count,
    days: evidence.month_day_count,
  }
  return (
    <>
      <Heading level="h3" className="txt-compact-medium-plus">
        {text.service_fee_heading}
      </Heading>
      <Text size="small" className="text-ui-fg-subtle max-w-prose">
        {formatText(text.service_fee_intro, { policy })}
      </Text>
      {evidence.status === "evidence_missing" ? (
        <Text size="small" className={clx(WRAP, "max-w-prose")}>
          {formatText(text.service_fee_evidence_missing, {
            count: evidence.unknown_dates.length,
          })}
        </Text>
      ) : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt className="txt-compact-small text-ui-fg-subtle">
            {text.calculation}
          </dt>
          <dd className={clx(WRAP, "txt-compact-small-plus tabular-nums")}>
            {formatText(text.service_fee_calculation, {
              policy,
              ...days,
              amount: formatExactDkk(evidence.amount ?? "0", locale),
            })}
          </dd>
          <dt className="txt-compact-small text-ui-fg-subtle">
            {text.service_fee_active_dates}
          </dt>
          <dd className={clx(WRAP, "txt-compact-small")}>
            {evidence.active_dates.length === 0 ? (
              text.service_fee_no_active_dates
            ) : (
              <>
                <span className="block">
                  {formatText(text.service_fee_days, days)}
                </span>
                <span className="text-ui-fg-subtle block">
                  {text.service_fee_dates_hint}
                </span>
              </>
            )}
          </dd>
        </dl>
      )}
      {evidence.accrual.status === "accrual_pending" && (
        <Text size="small" className="max-w-prose">
          {text.service_fee_accrual_pending}
        </Text>
      )}
      {lifecycle === "provisional" && evidence.counted_through && (
        <Text size="small" className="text-ui-fg-subtle max-w-prose">
          {formatText(text.service_fee_counted_through, {
            date: formatStatementDate(evidence.counted_through, locale),
          })}
        </Text>
      )}
    </>
  )
}

/**
 * Whether an entry was booked later than its handover minute, such as a
 * recovered recognition; a prompt booking repeats the same time, so it is
 * left out to keep the row short.
 */
const bookedLater = (entry: StatementEntry, locale: Locale) =>
  formatOrderDateTime(entry.posted_at, locale) !==
  formatOrderDateTime(entry.occurred_at, locale)

function OrderReference({
  entry,
  locale,
}: {
  entry: StatementEntry
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  if (!entry.order)
    return (
      <>
        {entry.kind === "service_fee_difference"
          ? text.entry_service_fee_difference
          : text.entry_order_unknown}
      </>
    )
  return (
    <Link
      href={`/orders/${encodeURIComponent(entry.order.id)}`}
      className={clx(
        WRAP,
        "text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:ring-mtogo-focus-ring txt-compact-small-plus rounded focus-visible:outline-none focus-visible:ring-2",
        // The link covers its whole row, so the row opens the Order.
        "after:absolute after:inset-0 after:content-['']",
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

/** A separate focusable link above the Order row's stretched hit area. */
function AdjustmentReference({
  entry,
  locale,
}: {
  entry: StatementEntry
  locale: Locale
}) {
  if (!entry.original_statement) return null
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const calculation = entry.calculation
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Link
        href={statementHref({ month: entry.original_statement.month, page: 1 })}
        className={clx(
          WRAP,
          "relative z-10 inline-flex min-h-11 min-w-11 items-center self-start text-ui-fg-interactive rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ui-bg-base",
        )}
      >
        {formatText(text.entry_original_statement, {
          month: formatStatementMonth(entry.original_statement.month, locale),
        })}
      </Link>
      {entry.kind === "service_fee_difference" &&
        calculation?.amount &&
        calculation.recognized_amount &&
        calculation.difference && (
          <span className={clx(WRAP, "txt-compact-small text-ui-fg-subtle")}>
            {formatText(text.entry_fee_difference_explanation, {
              target: formatExactDkk(calculation.amount, locale),
              recognized: formatExactDkk(calculation.recognized_amount, locale),
              difference: formatExactDkk(calculation.difference, locale),
            })}
          </span>
        )}
    </span>
  )
}

/**
 * A row whose Order link covers it (Medusa Admin's clickable table rows):
 * hover and keyboard focus highlight the whole row, while the link stays the
 * one real link, so middle-click and screen readers work as for any link.
 */
const ROW_OPENS_ORDER =
  "relative cursor-pointer transition-colors duration-150 hover:bg-ui-bg-base-hover focus-within:bg-ui-bg-base-hover motion-reduce:transition-none"

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
  // The Order detail shows the purchase and its terms; a row names its
  // funding only in the exceptional case that MTOGO pays the food credit,
  // which is prepared-food compensation without commission (#229).
  const fundedByMtogo = (entry: StatementEntry) =>
    entry.kind !== "service_fee_difference" &&
    entry.funded_by === "mtogo" && (
      <span className={clx(WRAP, "txt-compact-small text-ui-fg-subtle")}>
        {entry.kind === "prepared_food_compensation"
          ? text.entry_prepared_food
          : text.entry_funded_by_mtogo}
      </span>
    )
  const reconstructed = (entry: StatementEntry) =>
    entry.calculation?.reconstruction && (
      <span className={clx(WRAP, "txt-compact-small text-ui-fg-subtle")}>
        {text.entry_reconstructed}
      </span>
    )
  const outcome = (entry: StatementEntry) =>
    statementOutcomeText(entry.outcome, locale)
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
                <th scope="col" className="w-[28%] px-6 py-3">
                  {text.entry_order}
                </th>
                <th scope="col" className="px-3 py-3">
                  {text.entry_outcome}
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
                <tr
                  key={entry.id}
                  className={clx("align-top", entry.order && ROW_OPENS_ORDER)}
                >
                  <td className="px-6 py-3">
                    <span className="flex min-w-0 flex-col gap-1">
                      <OrderReference entry={entry} locale={locale} />
                      {fundedByMtogo(entry)}
                      {reconstructed(entry)}
                      <AdjustmentReference entry={entry} locale={locale} />
                    </span>
                  </td>
                  <td className="txt-compact-small px-3 py-3">
                    <span className="flex flex-col gap-1">
                      <span className={clx(WRAP, "txt-compact-small-plus")}>
                        {outcome(entry)}
                      </span>
                      <span>
                        {entry.original_statement && `${text.entry_original}: `}
                        {formatOrderDateTime(entry.occurred_at, locale)}
                      </span>
                      {(entry.original_statement ||
                        bookedLater(entry, locale)) && (
                        <span className="text-ui-fg-subtle">
                          {text.entry_posted}{" "}
                          {formatOrderDateTime(entry.posted_at, locale)}
                        </span>
                      )}
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
              <li
                key={entry.id}
                className={clx(
                  "flex flex-col gap-2 px-4 py-4",
                  entry.order && ROW_OPENS_ORDER,
                )}
              >
                <OrderReference entry={entry} locale={locale} />
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
                  <dt
                    className={clx(WRAP, "txt-compact-small text-ui-fg-subtle")}
                  >
                    {outcome(entry)}
                  </dt>
                  <dd className="txt-compact-small text-right">
                    {formatOrderDateTime(entry.occurred_at, locale)}
                  </dd>
                  {(entry.original_statement || bookedLater(entry, locale)) && (
                    <>
                      <dt className="txt-compact-small text-ui-fg-subtle">
                        {text.entry_posted}
                      </dt>
                      <dd className="txt-compact-small text-right">
                        {formatOrderDateTime(entry.posted_at, locale)}
                      </dd>
                    </>
                  )}
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
                {fundedByMtogo(entry)}
                {reconstructed(entry)}
                <AdjustmentReference entry={entry} locale={locale} />
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

/**
 * The month's unsuccessful Orders that earned nothing (#229): rejected or
 * cancelled before the food was prepared. They book no entry, so this shows
 * they were accounted for, by outcome, with no amount.
 */
export function UnsuccessfulOrders({
  outcomes,
  locale,
}: {
  outcomes: { outcome: string; count: number }[]
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  if (!outcomes.length) return null
  return (
    <Container className="rounded-card flex flex-col gap-2 px-4 py-4 sm:px-6">
      <Heading level="h2" id="statement-unsuccessful">
        {text.unsuccessful_heading}
      </Heading>
      <Text size="small" className="text-ui-fg-subtle max-w-prose">
        {text.unsuccessful_intro}
      </Text>
      <dl
        aria-labelledby="statement-unsuccessful"
        className="grid max-w-prose grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1"
      >
        {outcomes.map(({ outcome, count }) => (
          <div key={outcome} className="contents">
            <dt className={clx(WRAP, "txt-compact-small")}>
              {statementOutcomeText(outcome, locale)}
            </dt>
            <dd className="txt-compact-small-plus text-right tabular-nums">
              {count === 1
                ? text.unsuccessful_count_one
                : formatText(text.unsuccessful_count, { count })}
            </dd>
          </div>
        ))}
      </dl>
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
