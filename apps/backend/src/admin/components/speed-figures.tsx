import { ArrowDownMini, ArrowUpMini } from "@medusajs/icons"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { useId } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { ChartNumbers, NO_VALUE } from "./chart-numbers"
import { LegendKey, PROCESSING_COLOR, TRANSIT_COLOR } from "@dtc/charts"
import { ChartSection } from "./volume-figures"
import {
  changeSummary,
  exclusionSummary,
  formatDay,
  formatDuration,
  type ComparedTimeMeasure,
  type ExclusionReason,
  type Operations,
  type TimeMeasure,
} from "../lib/operations-api"
import { useScopeWording } from "./operations-scope"

const CHART_HEIGHT = 220

/** "78 Orders · none excluded": who the average speaks for, in one line. */
const populationLine = (measure: TimeMeasure<ExclusionReason>) => {
  const orders = `${measure.included} ${measure.included === 1 ? "Order" : "Orders"}`
  const excluded = exclusionSummary(measure.exclusions)
  return `${orders} · ${excluded === "None excluded" ? "none excluded" : excluded}`
}

/**
 * The last 24 hours against the previous seven days. The arrow points the
 * way the service went: faster reads green with an up arrow, slower orange
 * with a down arrow. The words say which, so neither colour nor arrow
 * carries the meaning alone.
 */
function ChangeLine({
  measure,
  previousSeconds,
}: Readonly<{
  measure: ComparedTimeMeasure<ExclusionReason>
  previousSeconds: number | null
}>) {
  const { text, tone } = changeSummary(
    measure.change_from_previous_7_days_percent,
    previousSeconds,
  )
  const Icon =
    { faster: ArrowUpMini, slower: ArrowDownMini, same: null, none: null }[
      tone
    ] ?? null
  return (
    <div
      className={clx(
        "flex items-center gap-x-1",
        tone === "faster" && "text-ui-tag-green-text",
        tone === "slower" && "text-ui-tag-orange-text",
        (tone === "same" || tone === "none") && "text-ui-fg-muted",
      )}
    >
      {Icon && <Icon aria-hidden className="shrink-0" />}
      <Text size="small" leading="compact" className="text-inherit">
        {text}
      </Text>
    </div>
  )
}

/**
 * One average time of the last 24 hours as a figure card (#262): what it
 * runs between, the average, the Orders it speaks for and its change from
 * the previous seven days. With no Order included there is no average,
 * never a zero.
 */
function TimeMeasureCard({
  title,
  span,
  measure,
  previousSeconds,
}: Readonly<{
  title: string
  /** The two moments the time runs between, such as "Placement to handover". */
  span: string
  measure: ComparedTimeMeasure<ExclusionReason>
  previousSeconds: number | null
}>) {
  const id = useId()
  const duration = formatDuration(measure.average_seconds)
  return (
    <Container
      role="region"
      aria-labelledby={id}
      className="flex min-w-0 flex-col divide-y p-0"
    >
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h3" id={id}>
          {title}
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {span}
        </Text>
      </div>
      <div className="flex flex-1 flex-col gap-y-2 px-6 py-4">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <Text
            size="xlarge"
            leading="compact"
            weight="plus"
            className={clx("tabular-nums", !duration && "text-ui-fg-muted")}
          >
            {duration ?? "No average"}
          </Text>
          {duration && (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              on average
            </Text>
          )}
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {populationLine(measure)}
        </Text>
        <ChangeLine measure={measure} previousSeconds={previousSeconds} />
      </div>
    </Container>
  )
}

/**
 * Order processing time and Delivery transit time of the last 24 hours side
 * by side (#262), named by what each runs between so the delivery part is
 * never read as the whole wait.
 */
export function SpeedFigures({ figures }: Readonly<{ figures: Operations }>) {
  const {
    processing_time: processing,
    delivery_transit_time: transit,
    times_per_day: week,
  } = figures
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TimeMeasureCard
        title="Order processing time"
        span="Placement to handover, last 24 hours"
        measure={processing}
        previousSeconds={week.processing_time.average_seconds}
      />
      <TimeMeasureCard
        title="Delivery transit time"
        span="Pickup to handover, last 24 hours"
        measure={transit}
        previousSeconds={week.delivery_transit_time.average_seconds}
      />
    </div>
  )
}

/** Seconds as minutes for the chart, null kept so a day without one is a gap. */
const minutesOf = (seconds: number | null) =>
  seconds === null ? null : Math.round(seconds / 60)

/** A chart axis tick: the weekday, and the date below it. */
function DayTick({
  x,
  y,
  payload,
}: Readonly<{ x?: number; y?: number; payload?: { value: string } }>) {
  const [weekday, ...day] = formatDay(payload?.value ?? "").split(" ")
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={14} textAnchor="middle" fill="var(--fg-subtle)" fontSize={11}>
        {weekday}
      </text>
      <text dy={27} textAnchor="middle" fill="var(--fg-muted)" fontSize={10}>
        {day.join(" ")}
      </text>
    </g>
  )
}

/** A transit point: a square, so the two lines differ in shape as well. */
function SquareDot({
  cx,
  cy,
}: Readonly<{ cx?: number; cy?: number; index?: number }>) {
  if (cx === undefined || cy === undefined) return <g />
  return (
    <rect x={cx - 3} y={cy - 3} width={6} height={6} fill={TRANSIT_COLOR} />
  )
}

/** One headline figure of the seven days, such as "Processing 43 min". */
function WeekAverage({
  label,
  value,
}: Readonly<{ label: string; value: string | null }>) {
  return (
    <div className="flex flex-col items-end">
      <dt>
        <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
          {label}
        </Text>
      </dt>
      <dd>
        <Text
          size="large"
          leading="compact"
          weight="plus"
          className={clx("tabular-nums", !value && "text-ui-fg-muted")}
        >
          {value ?? "No average"}
        </Text>
      </dd>
    </div>
  )
}

/**
 * Order processing time and Delivery transit time on each of the previous
 * seven complete Copenhagen days (#262), as two lines on one minute scale
 * so a slower kitchen and a slower delivery read apart. Processing is a
 * solid line with round points, transit a dashed line with square points,
 * so the two never depend on colour. A day without handovers is a gap.
 */
export function TimesPerDayChart({
  figures,
  className,
}: Readonly<{ figures: Operations; className?: string }>) {
  const { times_per_day: week } = figures
  const scope = useScopeWording()
  const points = week.days.map((day) => ({
    date: day.date,
    processing: minutesOf(day.processing_time.average_seconds),
    transit: minutesOf(day.delivery_transit_time.average_seconds),
  }))
  const first = formatDay(week.days[0].date)
  const last = formatDay(week.days.at(-1)!.date)
  const processingAverage = formatDuration(week.processing_time.average_seconds)
  const transitAverage = formatDuration(
    week.delivery_transit_time.average_seconds,
  )
  return (
    <ChartSection
      id="operations-times-per-day"
      title="Processing and transit time per day"
      description="Each Copenhagen day's average, by the day of the handover."
      headline={
        <dl className="flex gap-x-5">
          <WeekAverage label="Processing, 7 days" value={processingAverage} />
          <WeekAverage label="Transit, 7 days" value={transitAverage} />
        </dl>
      }
      className={className}
    >
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div aria-hidden className="flex flex-wrap gap-x-4 gap-y-1">
          <LegendKey mark="processing">
            Order processing time (placement to handover)
          </LegendKey>
          <LegendKey mark="transit">
            Delivery transit time (pickup to handover)
          </LegendKey>
        </div>
        <div aria-hidden style={{ height: CHART_HEIGHT }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 12, right: 16, bottom: 0, left: -12 }}
              accessibilityLayer={false}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border-base)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                interval={0}
                tick={<DayTick />}
                tickLine={false}
                axisLine={{ stroke: "var(--border-base)" }}
                height={40}
                padding={{ left: 16, right: 16 }}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, (max: number) => Math.max(max, 10)]}
                tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
                tickFormatter={(minutes: number) => `${minutes} min`}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Line
                dataKey="processing"
                stroke={PROCESSING_COLOR}
                strokeWidth={2}
                dot={{ r: 3.5, fill: PROCESSING_COLOR, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                dataKey="transit"
                stroke={TRANSIT_COLOR}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={<SquareDot />}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ChartNumbers
        caption={`Average Order processing time and Delivery transit time per Copenhagen day ${scope.across}, ${first} to ${last}, with the Orders in the processing time`}
        categoryHeader="Day"
        valueHeader={["Processing", "Transit", "Orders"]}
        rows={week.days.map((day) => ({
          key: day.date,
          label: formatDay(day.date),
          values: [
            formatDuration(day.processing_time.average_seconds) ?? NO_VALUE,
            formatDuration(day.delivery_transit_time.average_seconds) ??
              NO_VALUE,
            String(day.processing_time.included),
          ],
        }))}
        footer={[
          {
            label: "Seven days",
            value: [
              processingAverage ?? NO_VALUE,
              transitAverage ?? NO_VALUE,
              String(week.processing_time.included),
            ],
          },
          {
            label: "Excluded",
            value: [
              exclusionSummary(week.processing_time.exclusions),
              exclusionSummary(week.delivery_transit_time.exclusions),
              "",
            ],
          },
        ]}
      />
    </ChartSection>
  )
}
