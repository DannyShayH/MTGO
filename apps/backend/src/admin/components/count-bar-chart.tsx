import { type ComponentProps } from "react"
import { ChartNumbers } from "./chart-numbers"
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

const BAR_HEIGHT = 36
const AXIS_HEIGHT = 32

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
 * Counts per category as horizontal bars (#259), in the order the rows
 * arrive, with the same numbers in a table under the chart. Each bar carries
 * its name on the axis and its count at the end, so nothing relies on colour;
 * an empty category keeps a stub and a 0 rather than vanishing. The chart is
 * a picture for sighted operators; `ChartNumbers`, named by `caption`, holds
 * the numbers for screen readers and, folded until asked for, everyone else. Meant to sit flush in a
 * `Container` with `p-0 divide-y`.
 */
export function CountBarChart({
  rows,
  caption,
  categoryHeader,
  valueHeader,
  total,
  labelWidth = 200,
}: Readonly<{
  rows: CountBar[]
  caption: string
  categoryHeader: string
  valueHeader: string
  /** Shown as a final Total row when given. */
  total?: number
  /** Room for the longest category name, in pixels. */
  labelWidth?: number
}>) {
  return (
    <>
      <div className="px-6 py-4">
        <div
          aria-hidden
          style={{ height: rows.length * BAR_HEIGHT + AXIS_HEIGHT }}
          className="w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
              accessibilityLayer={false}
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border-base)"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
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
                width={labelWidth}
                tick={<CategoryTick />}
                tickLine={false}
                axisLine={{ stroke: "var(--border-base)" }}
              />
              <Bar
                dataKey="count"
                barSize={16}
                minPointSize={2}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                shape={(bar: BarShape) => (
                  <Rectangle
                    {...bar}
                    fill={
                      bar.payload?.count
                        ? "var(--fg-interactive)"
                        : "var(--border-strong)"
                    }
                  />
                )}
              >
                <LabelList
                  dataKey="count"
                  position="right"
                  fill="var(--fg-base)"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ChartNumbers
        caption={caption}
        categoryHeader={categoryHeader}
        valueHeader={valueHeader}
        rows={rows}
        footer={
          total === undefined
            ? undefined
            : [{ label: "Total", value: String(total) }]
        }
      />
    </>
  )
}
