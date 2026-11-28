import { Container, Heading, Text, clx } from "@medusajs/ui"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { ChartNumbers } from "./chart-numbers"
import {
  cancelledSummary,
  cancellationShortLabels,
  formatDay,
  formatPeriodEdge,
  hourLabels,
  peakHour,
  type Operations,
} from "../lib/operations-api"

const CHART_HEIGHT = 220
const AXIS_HEIGHT = 54
/** The least room, in pixels, one axis label needs beside the next. */
const TICK_SPACING = 30

/** One bar of a time chart: its axis name, its full name and its count. */
type TimeBar = {
  key: string
  tick: string
  /** Up to two short lines under the tick, such as "so far" or "+01:00". */
  notes: string[]
  label: string
  count: number
  isPartial?: boolean
  /** Labelled on the axis even when space allows only every few ticks. */
  isAlwaysLabelled?: boolean
}

type BarShape = ComponentProps<typeof Rectangle> & { payload?: TimeBar }

/** An axis label: the time, and below it what sets the bar apart. */
function TimeTick({
  x,
  y,
  payload,
  bars,
  step,
}: Readonly<{
  x?: number
  y?: number
  payload?: { value: string; index: number }
  bars: TimeBar[]
  /** Label every `step`th tick, counted back from the last. */
  step: number
}>) {
  const index = payload?.index ?? 0
  const bar = bars[index]
  const isLabelled =
    bar?.isAlwaysLabelled || (bars.length - 1 - index) % step === 0
  if (!isLabelled) return null
  const notes = bar?.notes ?? []
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={14} textAnchor="middle" fill="var(--fg-subtle)" fontSize={11}>
        {payload?.value}
      </text>
      {notes.map((note, line) => (
        <text
          key={note}
          dy={27 + line * 12}
          textAnchor="middle"
          fill="var(--fg-muted)"
          fontSize={10}
        >
          {note}
        </text>
      ))}
    </g>
  )
}

/** A chart's frame: what it shows, for which period and Orders, and a headline. */
function ChartSection({
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

function Headline({ value, unit }: Readonly<{ value: string; unit: string }>) {
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

/**
 * A bar's count above it, with a halo in the card colour so it stays legible
 * where it meets the average line or the grid. A zero is muted, and left out
 * when the bars are too narrow to carry one each; the table keeps it.
 */
function CountLabel({
  x,
  y,
  width,
  value,
  isRoomy,
}: Readonly<{
  x?: number | string
  y?: number | string
  width?: number | string
  value?: unknown
  isRoomy: boolean
}>) {
  const count = Number(value)
  if (!count && !isRoomy) return null
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 6}
      textAnchor="middle"
      fontSize={isRoomy ? 11 : 10}
      fill={count ? "var(--fg-base)" : "var(--fg-muted)"}
      stroke="var(--bg-base)"
      strokeWidth={3}
      strokeLinejoin="round"
      style={{ paintOrder: "stroke" }}
    >
      {count}
    </text>
  )
}

/** The rendered width of an element, following resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** One key of a chart legend: a small mark drawn like the chart draws it. */
function LegendKey({
  mark,
  children,
}: Readonly<{ mark: "bar" | "partial" | "line"; children: ReactNode }>) {
  return (
    <div className="flex items-center gap-x-1.5">
      <svg aria-hidden width="14" height="10" className="shrink-0">
        {mark === "line" ? (
          <line
            x1="0"
            x2="14"
            y1="5"
            y2="5"
            stroke="var(--fg-base)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        ) : (
          <rect
            x="1"
            y="1"
            width="12"
            height="8"
            rx="2"
            fill="var(--fg-interactive)"
            fillOpacity={mark === "partial" ? 0.35 : 1}
            stroke={mark === "partial" ? "var(--fg-interactive)" : "none"}
            strokeDasharray="3 2"
          />
        )}
      </svg>
      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
        {children}
      </Text>
    </div>
  )
}

/**
 * Columns of counts over time. A partial period's bar is outlined and
 * lighter, and its axis label says so, so nothing relies on colour; an empty
 * period keeps a stub rather than vanishing.
 */
function TimeBars({
  bars,
  average,
  legend,
}: Readonly<{ bars: TimeBar[]; average?: number; legend: ReactNode }>) {
  const Chart = average === undefined ? BarChart : ComposedChart
  const [chartRef, width] = useWidth<HTMLDivElement>()
  // How many ticks share one label at this width: 1 when all fit.
  const step = width
    ? Math.max(1, Math.ceil((bars.length * TICK_SPACING) / width))
    : 1
  return (
    <div className="flex flex-col gap-y-3 px-6 py-4">
      <div aria-hidden className="flex flex-wrap gap-x-4 gap-y-1">
        {legend}
      </div>
      <div
        ref={chartRef}
        aria-hidden
        style={{ height: CHART_HEIGHT }}
        className="w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <Chart
            data={bars}
            margin={{ top: 16, right: 12, bottom: 0, left: -20 }}
            accessibilityLayer={false}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border-base)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="tick"
              interval={0}
              tick={<TimeTick bars={bars} step={step} />}
              tickLine={false}
              axisLine={{ stroke: "var(--border-base)" }}
              height={AXIS_HEIGHT}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(max, average ?? 0, 1)]}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            {/* Before the bars, so the bars and their counts sit on top. */}
            {average !== undefined && (
              <ReferenceLine
                y={average}
                stroke="var(--fg-base)"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            )}
            <Bar
              dataKey="count"
              maxBarSize={32}
              minPointSize={2}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              shape={(bar: BarShape) => (
                <Rectangle
                  {...bar}
                  fill={
                    bar.payload?.count
                      ? "var(--fg-interactive)"
                      : "var(--border-strong)"
                  }
                  fillOpacity={bar.payload?.isPartial ? 0.35 : 1}
                  stroke={
                    bar.payload?.isPartial ? "var(--fg-interactive)" : undefined
                  }
                  strokeDasharray={bar.payload?.isPartial ? "3 2" : undefined}
                />
              )}
            >
              <LabelList
                dataKey="count"
                content={(label) => (
                  <CountLabel
                    x={label.x}
                    y={label.y}
                    width={label.width}
                    value={label.value}
                    isRoomy={step === 1}
                  />
                )}
              />
            </Bar>
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Orders placed in the last 24 hours and, among them, those now cancelled. */
export function PlacementsCard({ figures }: Readonly<{ figures: Operations }>) {
  const { placements } = figures
  const id = useId()
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
          All Restaurants. Orders cancelled since stay in the count.
        </Text>
      </div>
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Headline value={String(placements.total)} unit="placed" />
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {cancelledSummary(placements.cancelled)}
        </Text>
      </div>
      <div className="flex flex-1 flex-col gap-y-2 px-6 py-4">
        <Text
          size="xsmall"
          leading="compact"
          weight="plus"
          className="text-ui-fg-muted"
        >
          Cancelled by
        </Text>
        <dl className="flex flex-col gap-y-2">
          {placements.cancelled.categories.map(({ category, count }) => (
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
                  {cancellationShortLabels[category]}
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
          ))}
        </dl>
      </div>
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
  return (
    <ChartSection
      id="operations-orders-per-hour"
      title="Orders per hour"
      description={`All Restaurants, each Copenhagen clock hour from ${perHour.hours[0].local_time}. The current hour is counted so far.`}
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
        bars={bars}
        legend={
          <>
            <LegendKey mark="bar">Orders placed in the hour</LegendKey>
            <LegendKey mark="partial">Current hour, so far</LegendKey>
          </>
        }
      />
      <ChartNumbers
        caption={`Orders placed per Copenhagen clock hour across all Restaurants, from ${from} to ${calculatedAt}`}
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
  return (
    <ChartSection
      id="operations-placements-per-day"
      title="Placements per day"
      description="All Restaurants, each Copenhagen day. The average is the total divided by seven: days without Orders and days of 23 or 25 hours count as one day each."
      headline={<Headline value={average.toFixed(1)} unit="a day on average" />}
      className={className}
    >
      <TimeBars
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
        caption={`Orders placed per Copenhagen day across all Restaurants, ${first} to ${last}, with the seven-day average`}
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
