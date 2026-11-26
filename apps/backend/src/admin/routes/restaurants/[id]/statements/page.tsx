import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Label,
  Select,
  Table,
  Text,
  clx,
} from "@medusajs/ui"
import { FetchError } from "@medusajs/js-sdk"
import { useQuery } from "@tanstack/react-query"
import { useId, type ReactNode } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { sdk } from "../../../../lib/restaurant-api"
import {
  DEDUCTED_COMPONENTS,
  ORDER_SOURCE_KINDS,
  STATEMENT_COMPONENTS,
  STATEMENT_PAGE_SIZE,
  componentLabels,
  completenessExplanations,
  completenessLabels,
  currentCopenhagenMonth,
  formatAmount,
  formatDate,
  formatDateTime,
  formatMonth,
  formatRate,
  fundingLabel,
  isStatementMonth,
  kindLabel,
  lifecycleLabels,
  originalStatementMonth,
  outcomeLabel,
  participationLabels,
  problemText,
  reasonLabel,
  type Statement,
  type StatementDay,
  type StatementEntry,
  type StatementHeader,
  type StatementMonths,
  type StatementProblem,
  type StatementTotal,
} from "../../../../lib/statement-api"
import { useFeatureFlag } from "../../../../lib/use-feature-flag"

/** Long names and references wrap instead of widening the page. */
const WRAP_CLASSES = "min-w-0 break-words [overflow-wrap:anywhere]"
const LINK_CLASSES =
  "text-ui-fg-interactive hover:text-ui-fg-interactive-hover rounded focus-visible:shadow-borders-focus outline-none"

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

/** The month's state in words, never by colour alone. */
function StateBadges({
  header,
}: Readonly<{ header: Pick<StatementHeader, "lifecycle" | "completeness"> }>) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge
        size="2xsmall"
        color={header.lifecycle === "closed" ? "grey" : "blue"}
      >
        {lifecycleLabels[header.lifecycle]}
      </Badge>
      <Badge
        size="2xsmall"
        color={header.completeness === "complete" ? "green" : "orange"}
      >
        {completenessLabels[header.completeness]}
      </Badge>
    </span>
  )
}

function TotalValue({
  total,
  isDeduction,
  currency,
}: Readonly<{
  total: StatementTotal
  isDeduction: boolean
  currency: string
}>) {
  if (total.status === "unavailable")
    return (
      <>
        <Text weight="plus">Unavailable</Text>
        <Text size="small" className="text-ui-fg-subtle">
          {reasonLabel(total.reason)}
        </Text>
      </>
    )
  return (
    <Text
      size="base"
      weight="plus"
      className={clx(WRAP_CLASSES, "tabular-nums")}
    >
      {isDeduction && <span aria-hidden="true">−&#8202;</span>}
      {formatAmount(total.amount, currency)}
      {isDeduction && <span className="sr-only"> (deducted)</span>}
    </Text>
  )
}

/** The five whole-month totals, the same on every page of entries. */
function Totals({ header }: Readonly<{ header: StatementHeader }>) {
  return (
    <section aria-labelledby="statement-totals" className="space-y-3 px-6 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading level="h2" id="statement-totals">
          Whole-month totals
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          DKK excluding VAT · monthly activity
        </Text>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STATEMENT_COMPONENTS.map((component) => (
          <div
            key={component}
            className={clx(
              "shadow-borders-base flex min-w-0 flex-col gap-1 rounded-lg px-4 py-3",
              component === "balance" ? "bg-ui-bg-subtle" : "bg-ui-bg-base",
            )}
          >
            <dt className="txt-compact-small text-ui-fg-subtle">
              {componentLabels[component]}
            </dt>
            <dd className="flex min-w-0 flex-col gap-0.5">
              <TotalValue
                total={header.totals[component]}
                isDeduction={DEDUCTED_COMPONENTS.includes(component)}
                currency={header.currency_code}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ProblemSource({
  source,
  restaurantId,
}: Readonly<{
  source: StatementProblem["sources"][number]
  restaurantId: string
}>) {
  if (ORDER_SOURCE_KINDS.has(source.kind))
    return (
      <Link
        className={clx(LINK_CLASSES, WRAP_CLASSES)}
        to={`/orders/${source.id}`}
      >
        Order {source.id}
      </Link>
    )
  if (source.kind === "service_fee_month" && isStatementMonth(source.id))
    return (
      <Link
        className={LINK_CLASSES}
        to={`/restaurants/${restaurantId}/statements?month=${source.id}`}
      >
        {formatMonth(source.id)}
      </Link>
    )
  if (source.kind === "restaurant_participation")
    return <>Participation history</>
  return (
    <span className={WRAP_CLASSES}>
      {source.kind} {source.id}
    </span>
  )
}

/** A backlog can name hundreds of Orders; the first few show the trail. */
const SHOWN_SOURCES = 10

/** What withholds amounts, with its identified sources to trace it. */
function Problems({
  header,
  restaurantId,
}: Readonly<{ header: StatementHeader; restaurantId: string }>) {
  if (!header.problems.length) return null
  return (
    <section
      aria-labelledby="statement-problems"
      className="space-y-2 px-6 py-4"
    >
      <Heading level="h2" id="statement-problems">
        What the statement is missing
      </Heading>
      <ul className="flex list-disc flex-col gap-3 pl-5">
        {header.problems.map((problem) => (
          <li key={problem.code} className="space-y-1">
            <Text size="small" className={WRAP_CLASSES}>
              {problemText(problem)}
            </Text>
            {problem.sources.length > 0 && (
              <ul className="txt-compact-small flex flex-wrap gap-x-4 gap-y-1">
                {problem.sources.slice(0, SHOWN_SOURCES).map((source) => (
                  <li key={`${source.kind}:${source.id}`} className="min-w-0">
                    <ProblemSource
                      source={source}
                      restaurantId={restaurantId}
                    />
                  </li>
                ))}
                {problem.sources.length > SHOWN_SOURCES && (
                  <li className="text-ui-fg-subtle">
                    and {problem.sources.length - SHOWN_SOURCES} more
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Fact({
  term,
  children,
}: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <>
      <dt className="txt-compact-small text-ui-fg-subtle">{term}</dt>
      <dd className={clx(WRAP_CLASSES, "txt-compact-small tabular-nums")}>
        {children}
      </dd>
    </>
  )
}

/** Whether the month's fee obligation is booked, and when. */
function bookingText(
  accrual: Statement["statement"]["service_fee_evidence"]["accrual"],
) {
  if (accrual.status === "accrual_pending") return "Not booked yet"
  if (accrual.status !== "accrued") return "Not booked: evidence missing"
  return accrual.accrued_at
    ? `Booked ${formatDateTime(accrual.accrued_at)}`
    : "Booked"
}

/** How the month's service fee is calculated, so it can be reproduced. */
function ServiceFee({ result }: Readonly<{ result: Statement }>) {
  const evidence = result.statement.service_fee_evidence
  const policy = formatAmount(evidence.policy_amount)
  return (
    <section aria-labelledby="statement-fee" className="space-y-2 px-6 py-4">
      <Heading level="h2" id="statement-fee">
        Service-fee evidence
      </Heading>
      <dl className="grid max-w-2xl grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1">
        <Fact term="Terms">{evidence.terms_version}</Fact>
        <Fact term="Policy">{policy} a month, by active Copenhagen dates</Fact>
        {evidence.status === "evidence_missing" ? (
          <Fact term="Active dates">
            Unknown for {evidence.unknown_dates.length} of the month's{" "}
            {evidence.month_day_count} dates
          </Fact>
        ) : (
          <>
            <Fact term="Active dates">
              {evidence.active_date_count} of {evidence.month_day_count}
            </Fact>
            <Fact term="Calculation">
              {policy} × {evidence.active_date_count} ÷{" "}
              {evidence.month_day_count} ={" "}
              {formatAmount(evidence.amount ?? "0")}
            </Fact>
          </>
        )}
        {evidence.counted_through && (
          <Fact term="Counted through">
            {formatDate(evidence.counted_through)}
          </Fact>
        )}
        <Fact term="Booking">{bookingText(evidence.accrual)}</Fact>
      </dl>
    </section>
  )
}

/**
 * The month day by day (#228): which dates count for the service fee and
 * what was booked on each. It describes booked entries only and never
 * replaces a withheld monthly total.
 */
function Days({ result }: Readonly<{ result: Statement }>) {
  const days: StatementDay[] = result.statement.days
  if (!days.length) return null
  const currency = result.statement.currency_code
  return (
    <section aria-labelledby="statement-days" className="space-y-2 px-6 py-4">
      <Heading level="h2" id="statement-days">
        The month day by day
      </Heading>
      <Text size="small" className="text-ui-fg-subtle max-w-prose">
        Fee participation and booked entries by Copenhagen posting date. These
        are booked entries only, not the month's totals.
      </Text>
      <details className="group">
        <summary className="txt-compact-small-plus text-ui-fg-interactive focus-visible:shadow-borders-focus w-fit cursor-pointer rounded outline-none">
          Show {days.length} days
        </summary>
        <div
          className="mt-2 overflow-x-auto"
          role="region"
          aria-labelledby="statement-days"
          tabIndex={0}
        >
          <Table className="min-w-[640px]">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Date</Table.HeaderCell>
                <Table.HeaderCell>Participation</Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  Entries
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  Food credit
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  Commission
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">Net</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {days.map((day) => (
                <Table.Row key={day.date}>
                  <Table.Cell>{formatDate(day.date)}</Table.Cell>
                  <Table.Cell>
                    {participationLabels[day.participation]}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {day.orders}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-right tabular-nums">
                    {formatAmount(day.food_credit, currency)}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-right tabular-nums">
                    {formatAmount(day.commission, currency)}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-right tabular-nums">
                    {formatAmount(day.net, currency)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </details>
    </section>
  )
}

/** Unsuccessful Orders processed with no entitlement, by outcome. */
function OutcomesWithoutEntitlement({
  result,
}: Readonly<{ result: Statement }>) {
  const outcomes = result.statement.outcomes_without_entitlement
  if (!outcomes.length) return null
  return (
    <section
      aria-labelledby="statement-unsuccessful"
      className="space-y-2 px-6 py-4"
    >
      <Heading level="h2" id="statement-unsuccessful">
        Orders without food credit
      </Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Rejected or cancelled before the food was prepared: no food credit, no
        commission and no entry.
      </Text>
      <dl className="grid max-w-md grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1">
        {outcomes.map(({ outcome, count }) => (
          <Fact key={outcome} term={outcomeLabel(outcome)}>
            {count === 1 ? "1 Order" : `${count} Orders`}
          </Fact>
        ))}
      </dl>
    </section>
  )
}

function EntryOrder({ entry }: Readonly<{ entry: StatementEntry }>) {
  if (!entry.order)
    return (
      <>
        {entry.kind === "service_fee_difference"
          ? "Service-fee adjustment"
          : "No Order"}
      </>
    )
  return (
    <Link
      className={clx(LINK_CLASSES, WRAP_CLASSES)}
      to={`/orders/${entry.order.id}`}
    >
      {entry.order.display_id === null
        ? `Order ${entry.order.id}`
        : `Order #${entry.order.display_id}`}
    </Link>
  )
}

function EntryExplanation({ entry }: Readonly<{ entry: StatementEntry }>) {
  const calculation = entry.calculation ?? {}
  const value = (key: string) =>
    typeof calculation[key] === "string" ? (calculation[key] as string) : null
  const included = value("food_value_including_vat")
  const excluded = value("food_value_excluding_vat")
  const vat = value("vat_rate")
  const terms = value("terms_version")
  // A closed month's service fee recalculated later (#230).
  const target = value("amount")
  const recognized = value("recognized_amount")
  const difference = value("difference")
  return (
    <div className="flex flex-col gap-0.5">
      <Text size="small">{fundingLabel(entry.funded_by)}</Text>
      {entry.kind === "service_fee_difference" &&
        target &&
        recognized &&
        difference && (
          <Text size="small" className="text-ui-fg-subtle tabular-nums">
            Monthly fee {formatAmount(target)} minus already recognized{" "}
            {formatAmount(recognized)}: fee difference{" "}
            {formatAmount(difference)}
          </Text>
        )}
      {included && excluded && (
        <Text size="small" className="text-ui-fg-subtle tabular-nums">
          {formatAmount(included)} incl. VAT → {formatAmount(excluded)}
          {vat ? ` at ${formatRate(vat)} VAT` : ""}
        </Text>
      )}
      {terms && (
        <Text size="small" className={clx(WRAP_CLASSES, "text-ui-fg-subtle")}>
          Terms {terms}
        </Text>
      )}
    </div>
  )
}

function Entries({
  result,
  page,
  onPage,
}: Readonly<{
  result: Statement
  page: number
  onPage: (page: number) => void
}>) {
  const currency = result.statement.currency_code
  const amount = (value: string) => formatAmount(value, currency)
  const pages = Math.max(1, Math.ceil(result.count / STATEMENT_PAGE_SIZE))
  const restaurantId = result.statement.restaurant.id
  return (
    <section aria-labelledby="statement-entries" className="space-y-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-6">
        <Heading level="h2" id="statement-entries">
          Entries
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Newest booking first · {result.count} in the month
        </Text>
      </div>
      {result.entries.length === 0 && result.count > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-6">
          <Text className="text-ui-fg-subtle">
            This page is past the month's last entry.
          </Text>
          <Button size="small" variant="secondary" onClick={() => onPage(1)}>
            Go to the first page
          </Button>
        </div>
      )}
      {result.count === 0 && (
        <Text className="text-ui-fg-subtle px-6">
          No booked entries this month.
        </Text>
      )}
      {result.entries.length > 0 && (
        <div
          className="overflow-x-auto"
          role="region"
          aria-labelledby="statement-entries"
          tabIndex={0}
        >
          <Table className="min-w-[960px]">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Order</Table.HeaderCell>
                <Table.HeaderCell>Kind and outcome</Table.HeaderCell>
                <Table.HeaderCell>Dates</Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  Food credit
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">
                  Commission
                </Table.HeaderCell>
                <Table.HeaderCell className="text-right">Net</Table.HeaderCell>
                <Table.HeaderCell>Funding and calculation</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {result.entries.map((entry) => {
                const original = originalStatementMonth(entry)
                return (
                  <Table.Row key={entry.id} className="align-top [&_td]:py-3">
                    <Table.Cell className="max-w-[180px]">
                      <EntryOrder entry={entry} />
                    </Table.Cell>
                    <Table.Cell className={clx(WRAP_CLASSES, "max-w-[200px]")}>
                      <Text size="small" weight="plus">
                        {outcomeLabel(entry.outcome)}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        {kindLabel(entry.kind)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        Occurred {formatDateTime(entry.occurred_at)}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        Booked {formatDateTime(entry.posted_at)}
                      </Text>
                      {original && (
                        <Link
                          className={clx(LINK_CLASSES, "txt-compact-small")}
                          to={`/restaurants/${restaurantId}/statements?month=${original}`}
                        >
                          {entry.original_statement
                            ? `Adjustment for ${formatMonth(original)}`
                            : `Original month: ${formatMonth(original)}`}
                        </Link>
                      )}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-right tabular-nums">
                      {amount(entry.amounts.food_credit)}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-right tabular-nums">
                      {amount(entry.amounts.commission)}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-right font-medium tabular-nums">
                      {amount(entry.amounts.net)}
                    </Table.Cell>
                    <Table.Cell className="max-w-[260px]">
                      <EntryExplanation entry={entry} />
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </div>
      )}
      {result.entries.length > 0 && (
        <nav
          aria-label="Entry pages"
          className="flex flex-wrap items-center justify-between gap-3 px-6"
        >
          <Text size="small" className="text-ui-fg-subtle tabular-nums">
            Entries {Math.min(result.offset + 1, result.count)}–
            {Math.min(result.offset + result.entries.length, result.count)} of{" "}
            {result.count} · page {page} of {pages}
          </Text>
          <div className="flex gap-2">
            <Button
              size="small"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </section>
  )
}

function MonthPicker({
  month,
  months,
  onChange,
}: Readonly<{
  month: string
  months: ReturnType<typeof useMonths>
  onChange: (month: string) => void
}>) {
  const labelId = useId()
  if (months.error)
    return (
      <Retry
        message="Could not load this Restaurant's statement months."
        onRetry={() => void months.refetch()}
      />
    )
  const summaries = new Map(
    (months.data?.statements ?? []).map((summary) => [summary.month, summary]),
  )
  const values = summaries.has(month)
    ? [...summaries.keys()]
    : [month, ...summaries.keys()]
  // Each month's state in words, so a problem month stands out in the list.
  const describe = (value: string) => {
    const summary = summaries.get(value)
    return summary
      ? `${formatMonth(value)} · ${lifecycleLabels[summary.lifecycle]} · ${completenessLabels[summary.completeness]}`
      : formatMonth(value)
  }
  return (
    <div className="w-full space-y-1 sm:w-96">
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
              {describe(value)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  )
}

/** Every month summary of the Restaurant, newest first, read 50 at a time. */
async function readAllMonths(restaurantId: string) {
  const read = (offset: number) =>
    sdk.client.fetch<StatementMonths>(
      `/admin/restaurants/${restaurantId}/statements`,
      { query: { limit: MONTHS_PER_READ, offset } },
    )
  const first = await read(0)
  const statements = [...first.statements]
  while (statements.length < first.count) {
    const next = await read(statements.length)
    if (!next.statements.length) break
    statements.push(...next.statements)
  }
  return { ...first, statements }
}
const MONTHS_PER_READ = 50

const useMonths = (restaurantId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["restaurant-statements", restaurantId],
    queryFn: () => readAllMonths(restaurantId),
    enabled,
  })

const isNotFound = (error: unknown) =>
  error instanceof FetchError && error.status === 404

function StatementBody({
  restaurantId,
  month,
  page,
  onPage,
  monthsSettled,
}: Readonly<{
  restaurantId: string
  month: string
  page: number
  onPage: (page: number) => void
  monthsSettled: boolean
}>) {
  const statement = useQuery({
    queryKey: ["restaurant-statement", restaurantId, month, page],
    queryFn: () =>
      sdk.client.fetch<Statement>(
        `/admin/restaurants/${restaurantId}/statements/${month}`,
        {
          query: {
            limit: STATEMENT_PAGE_SIZE,
            offset: (page - 1) * STATEMENT_PAGE_SIZE,
          },
        },
      ),
    // Keep the previous page on screen only while paging within one month,
    // so a newly chosen month never shows another month's header or entries.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === month ? previous : undefined,
  })
  const loading = (
    <Text role="status" className="px-6 py-4">
      Loading statement…
    </Text>
  )
  if (statement.isLoading) return loading
  // Until the months read settles, a 404 may mean an unknown Restaurant
  // (the page then says so) rather than a month without a statement.
  if (isNotFound(statement.error) && !monthsSettled) return loading
  if (isNotFound(statement.error))
    return (
      <Text className="px-6 py-4">
        This Restaurant has no statement for {formatMonth(month)}: the month is
        before it was created or has not started.
      </Text>
    )
  if (statement.error || !statement.data)
    return (
      <div className="px-6 py-4">
        <Retry
          message="Could not load the statement. This does not mean the month is empty."
          onRetry={() => void statement.refetch()}
        />
      </div>
    )
  const result = statement.data
  const header = result.statement
  return (
    <div
      className={clx(
        "divide-y",
        statement.isPlaceholderData &&
          "opacity-60 motion-safe:transition-opacity",
      )}
      aria-busy={statement.isFetching}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="space-y-1">
          <Heading level="h2">{formatMonth(header.month)}</Heading>
          <StateBadges header={header} />
          <Text size="small" className="text-ui-fg-subtle max-w-prose">
            {completenessExplanations[header.completeness]}{" "}
            {header.lifecycle === "provisional"
              ? "The month has not ended, so amounts can still change."
              : "Amounts and warnings are fixed at month end. Later processing appears as an adjustment in the month posted."}
          </Text>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          Verified {formatDateTime(header.verified_at)} ({header.timezone})
        </Text>
      </div>
      <Totals header={header} />
      <Problems header={header} restaurantId={restaurantId} />
      <ServiceFee result={result} />
      <Days result={result} />
      <OutcomesWithoutEntitlement result={result} />
      <Entries result={result} page={page} onPage={onPage} />
    </div>
  )
}

/**
 * A Restaurant's monthly statement for MTOGO operators (#232): the same
 * read and evidence its staff see in the partner app, for any Restaurant,
 * active or not. Shown only while the backend releases statements.
 */
const RestaurantStatementsPage = () => {
  const { id = "" } = useParams()
  const [params, setParams] = useSearchParams()
  const requested = params.get("month")
  const month = isStatementMonth(requested)
    ? requested
    : currentCopenhagenMonth()
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1)
  const flags = useFeatureFlag("restaurant_statements")
  const months = useMonths(id, flags.isReleased)
  const back = (
    <Link className={LINK_CLASSES} to={`/restaurants/${id}`}>
      Back to Restaurant
    </Link>
  )
  if (flags.isLoading) return <Text role="status">Loading Statements…</Text>
  if (flags.error)
    return (
      <Retry
        message="Could not load Feature flags."
        onRetry={() => void flags.refetch()}
      />
    )
  if (!flags.isReleased)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Container>
          <Heading>Statements</Heading>
          <Text>Restaurant statements are not released yet.</Text>
        </Container>
      </div>
    )
  // The months read answers 404 only for a Restaurant that does not exist.
  if (isNotFound(months.error))
    return (
      <div className="flex flex-col gap-4">
        <Link className={LINK_CLASSES} to="/restaurants">
          Back to Restaurants
        </Link>
        <Container>
          <Heading>Statements</Heading>
          <Text>This Restaurant was not found.</Text>
        </Container>
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      {back}
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-4">
          <div className="min-w-0 space-y-1">
            <Heading className={WRAP_CLASSES}>
              Statements
              {months.data ? ` · ${months.data.restaurant.name}` : ""}
            </Heading>
            <Text size="small" className="text-ui-fg-subtle max-w-prose">
              The Restaurant's monthly activity in DKK excluding VAT, as its
              staff see it. Not a tax invoice, a payout or a running amount
              owed.
            </Text>
          </div>
          <MonthPicker
            month={month}
            months={months}
            // A new month starts on its first page of entries.
            onChange={(value) => setParams({ month: value })}
          />
        </div>
        <StatementBody
          restaurantId={id}
          month={month}
          page={page}
          onPage={(next) => setParams({ month, page: String(next) })}
          monthsSettled={!months.isPending}
        />
      </Container>
    </div>
  )
}

export default RestaurantStatementsPage
