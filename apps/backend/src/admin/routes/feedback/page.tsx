import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Star } from "@medusajs/icons"
import {
  Alert,
  Container,
  Heading,
  Label,
  Select,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"
import { sdk } from "../../lib/restaurant-api"

type Summary = {
  average: number | null
  count: number
  distribution: Record<string, number>
  delivered_orders: number
}
type Subject = Summary & { id: string; name: string; is_active: boolean }
type PeriodKey = "last_30_days" | "previous_month" | "all_time"
type Period = { key: PeriodKey; from: string | null; to: string | null }
type Statistics = {
  period: Period
  experience: Summary
  restaurants: Subject[]
  agents: Subject[]
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "last_30_days", label: "Last 30 days" },
  { key: "previous_month", label: "Previous calendar month" },
  { key: "all_time", label: "All time" },
]

const copenhagenDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Copenhagen",
  day: "numeric",
  month: "short",
  year: "numeric",
})
const copenhagenMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Copenhagen",
  month: "long",
  year: "numeric",
})

/** The resolved period in Copenhagen time; `to` is exclusive. */
function describePeriod({ key, from, to }: Period) {
  if (!from || !to) return "All delivered Orders"
  const lastIncluded = new Date(new Date(to).getTime() - 1)
  if (key === "previous_month") return copenhagenMonth.format(lastIncluded)
  return `${copenhagenDate.format(new Date(from))} – ${copenhagenDate.format(lastIncluded)}`
}

function Rating({ summary }: Readonly<{ summary: Summary }>) {
  return (
    <>{summary.average === null ? "No ratings" : summary.average.toFixed(1)}</>
  )
}

function SubjectTable({
  title,
  label,
  rows,
}: Readonly<{
  title: string
  label: string
  rows: Subject[]
}>) {
  return (
    <section className="space-y-3">
      <Heading level="h2">
        {title} ({label})
      </Heading>
      {rows.length === 0 ? (
        <Text>No delivered Orders in this period.</Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Average</Table.HeaderCell>
                <Table.HeaderCell>Ratings</Table.HeaderCell>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Table.HeaderCell key={n}>{n} star</Table.HeaderCell>
                ))}
                <Table.HeaderCell>Delivered Orders</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    {row.name}{" "}
                    {!row.is_active && (
                      <StatusBadge color="grey">Inactive</StatusBadge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Rating summary={row} />
                  </Table.Cell>
                  <Table.Cell>{row.count}</Table.Cell>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Table.Cell key={n}>{row.distribution[n]}</Table.Cell>
                  ))}
                  <Table.Cell>{row.delivered_orders}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </section>
  )
}

function StatisticsBody({ statistics }: Readonly<{ statistics: Statistics }>) {
  const { experience, restaurants, agents } = statistics
  return (
    <>
      <section className="space-y-2">
        <Heading level="h2">Overall experience</Heading>
        <Text>
          <Rating summary={experience} /> · {experience.count} ratings ·{" "}
          {experience.delivered_orders} delivered Orders
        </Text>
        <Text>
          {[1, 2, 3, 4, 5]
            .map((n) => `${n} star: ${experience.distribution[n]}`)
            .join(" · ")}
        </Text>
      </section>
      <SubjectTable
        title="Restaurants"
        label="food rating"
        rows={restaurants}
      />
      <SubjectTable
        title="Delivery agents"
        label="agent rating"
        rows={agents}
      />
    </>
  )
}

const FeedbackPage = () => {
  const periodLabelId = useId()
  const [period, setPeriod] = useState<PeriodKey>("last_30_days")
  const statistics = useQuery({
    queryKey: ["feedback-statistics", period],
    queryFn: () =>
      sdk.client.fetch<Statistics>("/admin/feedback/statistics", {
        query: { period },
      }),
  })
  let body = <Text role="status">Loading Feedback…</Text>
  if (statistics.data) body = <StatisticsBody statistics={statistics.data} />
  else if (!statistics.isLoading)
    body = <Alert variant="error">Could not load Feedback statistics.</Alert>
  return (
    <Container className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Feedback</Heading>
          <Text className="text-ui-fg-subtle" aria-live="polite">
            {statistics.data
              ? `Delivered Orders by handover time, Copenhagen: ${describePeriod(statistics.data.period)}`
              : "Delivered Orders by handover time"}
          </Text>
        </div>
        <div className="w-full space-y-1 sm:w-64">
          <Label id={periodLabelId} size="small" weight="plus">
            Period
          </Label>
          <Select
            size="small"
            value={period}
            onValueChange={(value) => setPeriod(value as PeriodKey)}
          >
            <Select.Trigger aria-labelledby={periodLabelId}>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {PERIODS.map(({ key, label }) => (
                <Select.Item key={key} value={key}>
                  {label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>
      {body}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Feedback", icon: Star })
export default FeedbackPage
