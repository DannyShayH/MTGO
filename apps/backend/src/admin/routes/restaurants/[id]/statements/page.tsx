import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { sdk } from "../../../../lib/restaurant-api"
import type { StatementSnapshot } from "../../../../../types/restaurant-statement"

const COMPONENTS = {
  food_credits: "Food credits",
  commission: "Commission",
  service_fee: "Service fee",
  adjustments: "Signed adjustments",
  balance: "Monthly balance",
} as const
const timestamp = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())

/** Operator inspection from a selected Restaurant, using the shared finance read. */
const StatementsPage = () => {
  const { id } = useParams()
  const [search, setSearch] = useSearchParams()
  const month = search.get("month") || currentMonth()
  const page = Math.max(1, Number(search.get("page")) || 1)
  const flags = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () =>
      sdk.client.fetch<{ feature_flags: Record<string, boolean> }>(
        "/admin/feature-flags",
      ),
  })
  const released = flags.data?.feature_flags.restaurant_statements === true
  const result = useQuery({
    queryKey: ["restaurant-statement", id, month, page],
    queryFn: () =>
      sdk.client.fetch<StatementSnapshot>(
        `/admin/restaurants/${id}/statements/${month}`,
        { query: { limit: 20, offset: (page - 1) * 20 } },
      ),
    enabled: released,
  })
  if (flags.isLoading) return <Text role="status">Loading statements…</Text>
  if (flags.error)
    return <Alert variant="error">Could not load Feature availability.</Alert>
  if (!released) return <Text>Statements are not released.</Text>
  const response = result.data
  const header = response?.statement
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link to={`/restaurants/${id}`}>Back to Restaurant</Link>
      <Container className="flex min-w-0 flex-col gap-3 px-6 py-4">
        <Heading className="break-words">
          {header?.restaurant.name ?? "Restaurant"} statements
        </Heading>
        <Text>
          Monthly activity in DKK excluding VAT. No earlier balance is carried
          forward. This is not a tax invoice or completed payout.
        </Text>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const selected = new FormData(event.currentTarget).get("month")
            if (typeof selected === "string") setSearch({ month: selected })
          }}
        >
          <div>
            <Label htmlFor="statement-month">Copenhagen calendar month</Label>
            <Input
              id="statement-month"
              name="month"
              type="month"
              defaultValue={month}
              key={month}
              max={currentMonth()}
              required
            />
          </div>
          <Button type="submit" variant="secondary">
            Show month
          </Button>
        </form>
      </Container>
      {result.isLoading && <Text role="status">Loading statement…</Text>}
      {!result.isLoading && result.error && (
        <Alert variant="error">
          Could not load this statement. This does not mean the month was empty.{" "}
          <Button variant="secondary" onClick={() => result.refetch()}>
            Try again
          </Button>
        </Alert>
      )}
      {!result.isLoading && !result.error && header && response && (
        <>
          <Container className="flex min-w-0 flex-col gap-4 px-6 py-4">
            <Heading level="h2">{month}</Heading>
            <div className="flex flex-wrap gap-2">
              <Badge>{header.lifecycle}</Badge>
              <Badge>{header.completeness.replace(/_/g, " ")}</Badge>
            </div>
            {header.lifecycle === "closed" && (
              <Text>
                Amounts and warnings are fixed at month end. Later processing
                appears as a linked adjustment in the month posted.
              </Text>
            )}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(COMPONENTS).map(([key, label]) => {
                const total = header.totals[key as keyof typeof COMPONENTS]
                return (
                  <div key={key} className="min-w-0">
                    <dt>{label}</dt>
                    <dd className="break-words font-medium tabular-nums">
                      {total.status === "available"
                        ? `DKK ${total.amount}`
                        : `Unavailable: ${total.reason.replace(/_/g, " ")}`}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <Text size="small">
              Balance = food credits − commission − service fee + signed
              adjustments.
            </Text>
            <Text size="small">
              Verified at {timestamp(header.verified_at)} (Europe/Copenhagen).
            </Text>
            {header.problems.length > 0 && (
              <div>
                <Heading level="h3">
                  Evidence and outstanding processing
                </Heading>
                <ul className="list-disc pl-5">
                  {header.problems.map((problem) => (
                    <li key={problem.code} className="break-words">
                      {problem.code.replace(/_/g, " ")} ({problem.count})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details>
              <summary className="cursor-pointer">Service-fee evidence</summary>
              <Text>
                DKK {header.service_fee_evidence.policy_amount} ×{" "}
                {header.service_fee_evidence.active_date_count} active dates ÷{" "}
                {header.service_fee_evidence.month_day_count} dates. Accrual:{" "}
                {header.service_fee_evidence.accrual.status.replace(/_/g, " ")}.
              </Text>
              <Text className="break-words">
                Active dates:{" "}
                {header.service_fee_evidence.active_dates.join(", ") ||
                  "None verified"}
              </Text>
            </details>
          </Container>
          <Container className="flex min-w-0 flex-col gap-4 px-6 py-4">
            <Heading level="h2">Entries ({response.count})</Heading>
            {response.entries.length === 0 && (
              <Text>No booked entries in this month.</Text>
            )}
            <ul className="divide-ui-border-base divide-y">
              {response.entries.map((entry) => (
                <li key={entry.id} className="flex min-w-0 flex-col gap-2 py-4">
                  <Text weight="plus">{entry.kind.replace(/_/g, " ")}</Text>
                  {entry.order && (
                    <Link to={`/orders/${entry.order.id}`}>
                      Order #{entry.order.display_id ?? entry.order.id}
                    </Link>
                  )}
                  <Text>
                    Original outcome: {timestamp(entry.occurred_at)}. Posted:{" "}
                    {timestamp(entry.posted_at)} (Europe/Copenhagen).
                  </Text>
                  {entry.original_statement && (
                    <Link to={`?month=${entry.original_statement.month}`}>
                      Adjustment for {entry.original_statement.month}
                    </Link>
                  )}
                  <Text className="break-words tabular-nums">
                    Food credit DKK {entry.amounts.food_credit}; commission DKK{" "}
                    {entry.amounts.commission}
                    {"service_fee" in entry.amounts
                      ? `; service-fee difference DKK ${entry.amounts.service_fee}`
                      : ""}
                    ; net DKK {entry.amounts.net}. Funding: {entry.funded_by}.
                  </Text>
                  <details>
                    <summary className="cursor-pointer">
                      Source and calculation
                    </summary>
                    <Text className="break-all">
                      {entry.source.kind}: {entry.source.id}
                    </Text>
                    <pre className="whitespace-pre-wrap break-all text-sm">
                      {JSON.stringify(entry.calculation, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
            <nav
              aria-label="Entry pages"
              className="flex flex-wrap items-center gap-3"
            >
              <Text>
                {response.offset + Math.min(response.entries.length, 1)}–
                {response.offset + response.entries.length} of {response.count}
              </Text>
              {page > 1 && (
                <Button
                  variant="secondary"
                  onClick={() => setSearch({ month, page: String(page - 1) })}
                >
                  Previous
                </Button>
              )}
              {response.offset + response.entries.length < response.count && (
                <Button
                  variant="secondary"
                  onClick={() => setSearch({ month, page: String(page + 1) })}
                >
                  Next
                </Button>
              )}
            </nav>
          </Container>
        </>
      )}
    </div>
  )
}
export default StatementsPage
