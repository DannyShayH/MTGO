"use client"

import type { ComponentProps } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

export type CountBar = { key: string; label: string; count: number }

/** What Recharts hands each bar's `shape`: its geometry and its row. */
type BarShape = ComponentProps<typeof Rectangle> & { payload?: CountBar }

/** Names on the axis: one row per bar, and the count axis under them. */
const AXIS_ROW_HEIGHT = 36
const AXIS_HEIGHT = 32
const AXIS_BAR_SIZE = 16
/** Names above: room per category for its name on one line, then its bar. */
const ABOVE_ROW_HEIGHT = 44
const ABOVE_BAR_SIZE = 12
/** How far each bar moves down from the middle of its row, under its name. */
const ABOVE_BAR_OFFSET = (ABOVE_ROW_HEIGHT - ABOVE_BAR_SIZE) / 2 - 6

const barFill = (count: number | undefined) =>
  count ? "var(--fg-interactive)" : "var(--border-strong)"

/** An axis label on one line: Recharts would wrap a long one mid-phrase. */
function CategoryTick({
  x,
  y,
  payload,
}: Readonly<{ x?: number; y?: number; payload?: { value: string } }>) {
  return (
    <text
      x={x}
      y={y}
      dx={-8}
      dy={4}
      textAnchor="end"
      fill="var(--fg-subtle)"
      fontSize={12}
    >
      {payload?.value}
    </text>
  )
}

/**
 * Counts per category as horizontal bars (#259, #264), in the order the rows
 * arrive. Each bar carries its name and its count, so nothing relies on
 * colour; an empty category keeps a stub and a 0 rather than vanishing.
 *
 * `names="axis"` puts the names on an axis to the left, `labelWidth` pixels
 * wide, for a desktop page. `names="above"` puts each name over its bar, so a
 * long Danish name never squeezes the bar on a phone.
 *
 * The picture is hidden from screen readers: a `ChartNumbers` table under it
 * carries the numbers. `className` sets the padding around the chart.
 */
export function CountBars({
  rows,
  names,
  labelWidth = 200,
  className,
}: Readonly<{
  rows: CountBar[]
  names: "axis" | "above"
  /** Room for the longest category name, in pixels, with names on the axis. */
  labelWidth?: number
  className?: string
}>) {
  const isOnAxis = names === "axis"
  const barSize = isOnAxis ? AXIS_BAR_SIZE : ABOVE_BAR_SIZE
  const offset = isOnAxis ? 0 : ABOVE_BAR_OFFSET
  const height = isOnAxis
    ? rows.length * AXIS_ROW_HEIGHT + AXIS_HEIGHT
    : rows.length * ABOVE_ROW_HEIGHT
  return (
    <div className={className}>
      <div aria-hidden="true" style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: isOnAxis ? 0 : 4, right: 32, bottom: 0, left: 0 }}
            accessibilityLayer={false}
          >
            {isOnAxis && (
              <CartesianGrid
                horizontal={false}
                stroke="var(--border-base)"
                strokeDasharray="3 3"
              />
            )}
            <XAxis
              type="number"
              hide={!isOnAxis}
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(max, 1)]}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              height={AXIS_HEIGHT}
            />
            <YAxis
              type="category"
              dataKey="label"
              hide={!isOnAxis}
              width={labelWidth}
              tick={<CategoryTick />}
              tickLine={false}
              axisLine={{ stroke: "var(--border-base)" }}
            />
            <Bar
              dataKey="count"
              barSize={barSize}
              minPointSize={2}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              shape={(bar: BarShape) => (
                <Rectangle
                  {...bar}
                  y={Number(bar.y) + offset}
                  fill={barFill(bar.payload?.count)}
                />
              )}
            >
              {!isOnAxis && (
                <LabelList
                  dataKey="label"
                  content={(label) => (
                    <text
                      x={Number(label.x)}
                      y={Number(label.y) + offset - 7}
                      fill="var(--fg-subtle)"
                      fontSize={12}
                    >
                      {String(label.value)}
                    </text>
                  )}
                />
              )}
              <LabelList
                dataKey="count"
                content={(label) => (
                  <text
                    x={Number(label.x) + Number(label.width) + 6}
                    y={Number(label.y) + offset + barSize / 2 + 4}
                    fill={
                      Number(label.value) ? "var(--fg-base)" : "var(--fg-muted)"
                    }
                    fontSize={12}
                  >
                    {String(label.value)}
                  </text>
                )}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
