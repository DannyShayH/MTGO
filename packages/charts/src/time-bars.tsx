"use client"

import {
  useEffect,
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
import { clx } from "@medusajs/ui"

const AXIS_HEIGHT = 54

/**
 * The top of the count axis: the largest value rounded up to 1, 2, 2.5 or 5
 * times a power of ten, so the gridlines fall on round numbers (20, not 19).
 */
const roundUp = (value: number) => {
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10
  return step * power
}

/** One bar of a time chart: its axis name, the notes under it and its count. */
export type TimeBar = {
  key: string
  tick: string
  /** Up to two short lines under the tick, such as "so far" or "+01:00". */
  notes: string[]
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
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={14} textAnchor="middle" fill="var(--fg-subtle)" fontSize={11}>
        {payload?.value}
      </text>
      {(bar?.notes ?? []).map((note, line) => (
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

/**
 * A bar's count above it, with a halo in the card colour so it stays legible
 * where it meets the average line or the grid. A zero is muted. When the bars
 * are too narrow to carry one each, zeros are left out, and with
 * `narrowCounts="none"` every count is; the table keeps them.
 */
function CountLabel({
  x,
  y,
  width,
  value,
  isRoomy,
  narrowCounts,
}: Readonly<{
  x?: number | string
  y?: number | string
  width?: number | string
  value?: unknown
  isRoomy: boolean
  narrowCounts: "non-zero" | "none"
}>) {
  const count = Number(value)
  if (!isRoomy && (!count || narrowCounts === "none")) return null
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

/**
 * Columns of counts over time (#261, #264). A partial period's bar is
 * outlined and lighter, and its axis label says so, so nothing relies on
 * colour; an empty period keeps a stub rather than vanishing. When the chart
 * is too narrow to label every tick (a phone), only every few are labelled,
 * counted back from the last, and a bar marked `isAlwaysLabelled` keeps its
 * label.
 *
 * The picture is hidden from screen readers: a `ChartNumbers` table under it
 * carries the numbers. `className` sets the padding around the chart.
 */
export function TimeBars({
  bars,
  average,
  legend,
  height = 220,
  tickSpacing = 30,
  narrowCounts = "non-zero",
  className,
}: Readonly<{
  bars: TimeBar[]
  /** Drawn as a dashed line across the bars when given. */
  average?: number
  legend: ReactNode
  height?: number
  /** The least room, in pixels, one axis label needs beside the next. */
  tickSpacing?: number
  /** Which counts stay above the bars once not every tick is labelled. */
  narrowCounts?: "non-zero" | "none"
  className?: string
}>) {
  const Chart = average === undefined ? BarChart : ComposedChart
  const [chartRef, width] = useWidth<HTMLDivElement>()
  // How many ticks share one label at this width: 1 when all fit.
  const step = width
    ? Math.max(1, Math.ceil((bars.length * tickSpacing) / width))
    : 1
  return (
    <div className={clx("flex flex-col gap-y-3", className)}>
      <div aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1">
        {legend}
      </div>
      <div
        ref={chartRef}
        aria-hidden="true"
        style={{ height }}
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
              domain={[
                0,
                (max: number) => roundUp(Math.max(max, average ?? 0, 1)),
              ]}
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
                    narrowCounts={narrowCounts}
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
