import { Container, Heading, Text, clx } from "@medusajs/ui"
import { useId, type ReactNode } from "react"
import { LegendKey, TimeBars, type TimeBar as SharedTimeBar } from "@dtc/charts"
import { ChartNumbers } from "./chart-numbers"
import {
  causeLabels,
  inCauseOrder,
  formatDay,
  formatPeriodEdge,
  hourLabels,
  peakHour,
  type Operations,
} from "../lib/operations-api"
import { useScopeWording } from "./operations-scope"

/** One bar of a time chart, and its row in the numbers under it. */
type TimeBar = SharedTimeBar & { label: string }

/** A chart's frame: what it shows, for which period and Orders, and a headline. */
export function ChartSection({
  id,
  title,
  description,
  headline,
  children,
  className,
}: Readonly<{
  id: string
  title: string
  description: string
  headline: ReactNode
  children: ReactNode
  className?: string
}>) {
  return (
    <Container
      role="region"
      aria-labelledby={id}
      className={clx("flex min-w-0 flex-col divide-y p-0", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h3" id={id}>
            {title}
          </Heading>
          <Text
            size="small"
            leading="compact"
            className="max-w-prose text-ui-fg-subtle"
          >
            {description}
          </Text>
        </div>
        {headline}
      </div>
      {children}
    </Container>
  )
}

export function Headline({
  value,
  unit,
}: Readonly<{ value: string; unit: string }>) {
  return (
    <div className="flex items-baseline gap-x-1.5">
      <Text
        size="xlarge"
        leading="compact"
        weight="plus"
        className="tabular-nums"
      >
        {value}
      </Text>
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {unit}
      </Text>
    </div>
  )
}

/** Orders placed in the last 24 hours and, among them, those now cancelled. */
export function PlacementsCard({ figures }: Readonly<{ figures: Operations }>) {
  const { placements } = figures
  const id = useId()
  const scope = useScopeWording()
  return (
    <Container
      role="region"
      aria-labelledby={id}
      className="flex min-w-0 flex-col divide-y p-0"
    >
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h3" id={id}>
          Orders placed
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {scope.label}, cancellations included.
        </Text>
      </div>
      <div className="px-6 py-4">
        <Headline value={String(placements.total)} unit="placed" />
      </div>
      {/* The one place the cancellations are counted, in the Unfulfilled
          chart's order and wording, so each number is found once. */}
      <dl className="flex flex-1 flex-col gap-y-2 px-6 py-4">
        <div className="flex items-baseline justify-between gap-x-3 pb-1">
          <dt>
            <Text size="small" leading="compact" weight="plus">
              Cancelled
            </Text>
          </dt>
          <dd>
            <Text
              size="small"
              leading="compact"
              weight="plus"
              className="tabular-nums"
            >
              {placements.cancelled.total}
            </Text>
          </dd>
        </div>
        {inCauseOrder(placements.cancelled.categories).map(
          ({ category, count }) => (
            <div
              key={category}
              className="flex items-baseline justify-between gap-x-3"
            >
              <dt>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {causeLabels[category]}
                </Text>
              </dt>
              <dd>
                <Text
                  size="small"
                  leading="compact"
                  className={clx(
                    "tabular-nums",
                    count === 0 && "text-ui-fg-muted",
                  )}
                >
                  {count}
                </Text>
              </dd>
            </div>
          ),
        )}
      </dl>
    </Container>
  )
}

/**
 * Placements in each of the last 24 Copenhagen clock hours (#261). The
 * current hour is marked "so far", and the repeated hour on the night the
 * clocks go back carries its UTC offset.
 */
export function OrdersPerHourChart({
  figures,
  calculatedAt,
  className,
}: Readonly<{
  figures: Operations
  calculatedAt: string
  className?: string
}>) {
  const { orders_per_hour: perHour } = figures
  const labels = hourLabels(perHour.hours)
  const bars: TimeBar[] = perHour.hours.map((hour, index) => {
    const isRepeated = labels[index].includes(hour.utc_offset)
    return {
      key: hour.starts_at,
      tick: hour.local_time.slice(0, 2),
      notes: [
        ...(isRepeated ? [hour.utc_offset] : []),
        ...(hour.is_current ? ["so far"] : []),
      ],
      label: labels[index],
      count: hour.count,
      isPartial: hour.is_current,
      isAlwaysLabelled: isRepeated || hour.is_current,
    }
  })
  const from = formatPeriodEdge(perHour.period.starts_at)
  const peak = peakHour(perHour.hours)
  const scope = useScopeWording()
  return (
    <ChartSection
      id="operations-orders-per-hour"
      title="Orders per hour"
      description={`${scope.label}, each Copenhagen clock hour from ${perHour.hours[0].local_time}.`}
      headline={
        peak ? (
          <Headline
            value={String(peak.count)}
            unit={`at peak, ${peak.label}`}
          />
        ) : (
          <Headline value="0" unit="placed" />
        )
      }
      className={className}
    >
      <TimeBars
        className="px-6 py-4"
        bars={bars}
        legend={
          <>
            <LegendKey mark="bar">Orders placed in the hour</LegendKey>
            <LegendKey mark="partial">Current hour, so far</LegendKey>
          </>
        }
      />
      <ChartNumbers
        caption={`Orders placed per Copenhagen clock hour ${scope.across}, from ${from} to ${calculatedAt}`}
        categoryHeader="Hour (Copenhagen time)"
        valueHeader="Orders placed"
        rows={bars}
        footer={[{ label: "Total", value: String(perHour.total) }]}
      />
    </ChartSection>
  )
}

/**
 * Placements on each of the previous seven complete Copenhagen days, with
 * the seven-day average (ADR-0015) drawn as a dashed line and named on it.
 */
export function PlacementsPerDayChart({
  figures,
  className,
}: Readonly<{ figures: Operations; className?: string }>) {
  const { placements_per_day: perDay } = figures
  const average = perDay.average_per_day
  const bars: TimeBar[] = perDay.days.map(({ date, count }) => {
    const label = formatDay(date)
    const [weekday, ...day] = label.split(" ")
    return { key: date, tick: weekday, notes: [day.join(" ")], label, count }
  })
  const first = formatDay(perDay.days[0].date)
  const last = formatDay(perDay.days.at(-1)!.date)
  const scope = useScopeWording()
  return (
    <ChartSection
      id="operations-placements-per-day"
      title="Placements per day"
      description={`${scope.label}, each Copenhagen day.`}
      headline={<Headline value={average.toFixed(1)} unit="a day on average" />}
      className={className}
    >
      <TimeBars
        className="px-6 py-4"
        bars={bars}
        average={average}
        legend={
          <>
            <LegendKey mark="bar">Orders placed on the day</LegendKey>
            <LegendKey mark="line">
              {`Average ${average.toFixed(1)} a day`}
            </LegendKey>
          </>
        }
      />
      <ChartNumbers
        caption={`Orders placed per Copenhagen day ${scope.across}, ${first} to ${last}, with the seven-day average`}
        categoryHeader="Day"
        valueHeader="Orders placed"
        rows={bars}
        footer={[
          { label: "Total", value: String(perDay.total) },
          { label: "Average a day (total ÷ 7)", value: average.toFixed(1) },
        ]}
      />
    </ChartSection>
  )
}
