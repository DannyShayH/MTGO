import { CountBars, type CountBar } from "@dtc/charts"
import { ChartNumbers } from "./chart-numbers"

/**
 * Counts per category as horizontal bars (#259), names on the axis, with the
 * same numbers in a table under the chart and an optional Total row. The
 * bars come from `@dtc/charts`, shared with the partner app. Meant to sit
 * flush in a `Container` with `p-0 divide-y`.
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
      <CountBars
        rows={rows}
        names="axis"
        labelWidth={labelWidth}
        className="px-6 py-4"
      />
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
