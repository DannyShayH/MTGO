import Link from "next/link"
import { notFound } from "next/navigation"
import {
  formatOrderTime,
  formatStatementMonth,
  formatText,
  RESTAURANT_STATEMENTS_TEXT,
} from "@dtc/i18n"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { listStatementMonths, retrieveStatement } from "@lib/data/statements"
import { parseStatementQuery, statementHref } from "@lib/statement-query"
import {
  LINK_BUTTON,
  MonthPicker,
  StatementBadges,
  StatementEntries,
  StatementProblems,
  StatementTotals,
  UnsuccessfulOrders,
} from "@modules/statements/components/statement-view"
import { StatementDaysChart } from "@modules/statements/components/statement-days-chart"

/**
 * The Restaurant's monthly statement (#227): read-only, in DKK excl. VAT,
 * the current Copenhagen month first. Withheld by the backend until
 * Restaurant statements are released, so the page is then not found.
 */
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const current = await requireCurrentStaff()
  if (!current.features?.restaurant_statements) notFound()
  const { locale } = await getMessages()
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  const query = parseStatementQuery(await searchParams, new Date())
  const restaurantId = current.restaurant.id
  const [months, result] = await Promise.all([
    listStatementMonths(restaurantId),
    retrieveStatement(restaurantId, query.month, query.page),
  ])
  if (months === "not_found") notFound()
  const monthOptions = months ? months.statements.map(({ month }) => month) : []

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Heading level="h1">{text.title}</Heading>
        <Text className="text-ui-fg-subtle max-w-prose">{text.intro}</Text>
        <Text size="small" className="text-ui-fg-subtle max-w-prose">
          {text.not_invoice}
        </Text>
      </header>
      <Container className="rounded-card flex flex-col gap-4 px-4 py-4 sm:px-6">
        <MonthPicker
          months={monthOptions}
          selected={query.month}
          locale={locale}
        />
      </Container>
      {result === "not_found" ? (
        <Container className="rounded-card px-4 py-6 sm:px-6" role="status">
          <Text className="text-ui-fg-subtle">
            {formatStatementMonth(query.month, locale)}: {text.unavailable}
          </Text>
        </Container>
      ) : !result ? (
        <Container
          role="alert"
          className="rounded-card flex flex-col gap-2 px-4 py-6 sm:px-6"
        >
          <Heading level="h2">{text.unavailable_title}</Heading>
          <Text className="text-ui-fg-subtle">{text.retry_hint}</Text>
          <Link
            prefetch={false}
            href={statementHref(query)}
            className={clx(LINK_BUTTON, "mt-2 self-start")}
          >
            {text.retry}
          </Link>
        </Container>
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-3">
              <Heading level="h2" className="capitalize">
                {formatStatementMonth(result.statement.month, locale)}
              </Heading>
              <StatementBadges header={result.statement} locale={locale} />
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {formatText(text.verified_at, {
                time: formatOrderTime(result.statement.verified_at, locale),
              })}
            </Text>
          </section>
          {result.statement.lifecycle === "closed" && (
            <Text size="small" className="text-ui-fg-subtle max-w-prose">
              {text.closed_warnings_fixed}
            </Text>
          )}
          <StatementTotals
            header={result.statement}
            serviceFee={{
              evidence: result.statement.service_fee_evidence,
              lifecycle: result.statement.lifecycle,
            }}
            locale={locale}
          />
          <StatementProblems header={result.statement} locale={locale} />
          {result.statement.days?.length > 0 && (
            <StatementDaysChart
              month={result.statement.month}
              days={result.statement.days}
              isWithheld={
                result.statement.totals.balance.status === "unavailable"
              }
              locale={locale}
            />
          )}
          <StatementEntries result={result} query={query} locale={locale} />
          <UnsuccessfulOrders
            outcomes={result.statement.outcomes_without_entitlement ?? []}
            locale={locale}
          />
        </>
      )}
    </div>
  )
}
