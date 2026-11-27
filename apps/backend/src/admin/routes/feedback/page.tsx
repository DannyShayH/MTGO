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
  clx,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"
import { CountBarChart } from "../../components/count-bar-chart"
import { LoadingStatus } from "../../components/loading-status"
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

const STARS = [5, 4, 3, 2, 1] as const
const starLabel = (n: number) => (n === 1 ? "1 star" : `${n} stars`)

function Average({ summary }: Readonly<{ summary: Summary }>) {
  return summary.average === null ? (
    <span className="text-ui-fg-muted">No ratings</span>
  ) : (
    <>{summary.average.toFixed(1)}</>
  )
}

/** A count in a table, greyed out when zero so the real counts stand out. */
function Count({ value }: Readonly<{ value: number }>) {
  return <span className={clx(!value && "text-ui-fg-muted")}>{value}</span>
}

const numeric = "text-right tabular-nums"

function SubjectTable({
  title,
  description,
  rows,
}: Readonly<{
  title: string
  description: string
  rows: Subject[]
}>) {
  const captionId = useId()
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2" id={captionId}>
          {title}
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {description}
        </Text>
      </div>
      {rows.length === 0 ? (
        <Text
          size="small"
          leading="compact"
          className="px-6 py-4 text-ui-fg-subtle"
        >
          No delivered Orders in this period.
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-labelledby={captionId}>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell scope="col">Name</Table.HeaderCell>
                <Table.HeaderCell scope="col" className="text-right">
                  Average
                </Table.HeaderCell>
                <Table.HeaderCell scope="col" className="text-right">
                  Ratings
                </Table.HeaderCell>
                {STARS.map((n) => (
                  <Table.HeaderCell
                    key={n}
                    scope="col"
                    className="text-right whitespace-nowrap"
                  >
                    {starLabel(n)}
                  </Table.HeaderCell>
                ))}
                <Table.HeaderCell
                  scope="col"
                  className="text-right whitespace-nowrap"
                >
                  Delivered Orders
                </Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.HeaderCell scope="row" className="font-normal">
                    <span className="flex items-center gap-x-2 whitespace-nowrap">
                      {row.name}
                      {!row.is_active && (
                        <StatusBadge color="grey">Inactive</StatusBadge>
                      )}
                    </span>
                  </Table.HeaderCell>
                  <Table.Cell className={clx(numeric, "font-medium")}>
                    <Average summary={row} />
                  </Table.Cell>
                  <Table.Cell className={numeric}>
                    <Count value={row.count} />
                  </Table.Cell>
                  {STARS.map((n) => (
                    <Table.Cell key={n} className={numeric}>
                      <Count value={row.distribution[n] ?? 0} />
                    </Table.Cell>
                  ))}
                  <Table.Cell className={numeric}>
                    <Count value={row.delivered_orders} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  )
}

function Experience({
  experience,
  period,
}: Readonly<{ experience: Summary; period: string }>) {
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h2">Overall experience</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {experience.count} of {experience.delivered_orders} delivered Orders
            rated, {period}
          </Text>
        </div>
        <div className="flex items-baseline gap-x-1.5">
          <Text
            size="xlarge"
            leading="compact"
            weight="plus"
            className="tabular-nums"
          >
            {experience.average === null ? "–" : experience.average.toFixed(1)}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {experience.average === null ? "no ratings" : "out of 5"}
          </Text>
        </div>
      </div>
      <CountBarChart
        rows={STARS.map((n) => ({
          key: String(n),
          label: starLabel(n),
          count: experience.distribution[n] ?? 0,
        }))}
        total={experience.count}
        categoryHeader="Rating"
        valueHeader="Ratings"
        labelWidth={72}
        caption={`Overall experience ratings by stars, ${period}, ${experience.count} ratings`}
      />
    </Container>
  )
}

function StatisticsBody({ statistics }: Readonly<{ statistics: Statistics }>) {
  const { experience, restaurants, agents } = statistics
  const period = describePeriod(statistics.period)
  return (
    <>
      <Experience experience={experience} period={period} />
      <SubjectTable
        title="Restaurants"
        description="Food rating per Restaurant"
        rows={restaurants}
      />
      <SubjectTable
        title="Delivery agents"
        description="Agent rating per Delivery agent"
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
    placeholderData: keepPreviousData,
  })
  const isSwitching = statistics.isFetching && statistics.isPlaceholderData
  let body = (
    <Container className="p-0">
      <LoadingStatus label="Loading Feedback…" />
    </Container>
  )
  if (statistics.data)
    body = (
      <div
        aria-busy={isSwitching}
        className={clx(
          "flex flex-col gap-y-3 transition-opacity duration-150 ease-out",
          isSwitching && "opacity-60",
        )}
      >
        <StatisticsBody statistics={statistics.data} />
      </div>
    )
  else if (!statistics.isLoading)
    body = <Alert variant="error">Could not load Feedback statistics.</Alert>
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading>Feedback</Heading>
          <Text
            size="small"
            leading="compact"
            className="text-ui-fg-subtle"
            aria-live="polite"
          >
            {statistics.data
              ? `Delivered Orders by handover time, Copenhagen: ${describePeriod(statistics.data.period)}`
              : "Delivered Orders by handover time"}
          </Text>
        </div>
        <div className="flex w-full items-center gap-x-2 sm:w-auto">
          <Label
            id={periodLabelId}
            size="small"
            weight="plus"
            className="shrink-0"
          >
            Period
          </Label>
          <div className="w-full sm:w-56">
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
      </Container>
      {body}
    </div>
  )
}

export const config = defineRouteConfig({ label: "Feedback", icon: Star })
export default FeedbackPage
