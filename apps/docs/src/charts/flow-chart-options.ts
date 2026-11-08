import {
  STATUS,
  type FlowDay,
  nextIsoWeek,
  roundDays,
  WORK_TYPES,
  type CycleTimeWeek,
  type Week,
  type WorkType,
} from "../../scripts/flow-metrics.ts"

/** Colors read from the page's CSS tokens, so the charts follow the theme */
export type ChartPalette = {
  text: string
  muted: string
  grid: string
  surface: string
  /** One color per work type slot, the first also draws cycle time */
  series: string[]
}

type ThroughputWeek = Pick<Week, "week" | "count"> & {
  workTypes: Pick<WorkType, "name" | "count">[]
}
type ChartSeries = {
  name: string
  type: "bar" | "line"
  stack?: string
  itemStyle: {
    color?: string
    borderColor?: string
    borderWidth?: number
    opacity?: number
  }
  data: (number | null)[]
  [option: string]: unknown
}
type TooltipPoint = {
  seriesName: string
  value: number | null
  marker: string
  axisValue: string
}

const TOTAL = "Total"

/** Every ISO week from the first to the last label, so an empty week stays visible */
function continuousWeeks(labels: string[]): string[] {
  if (labels.length === 0) return []
  const last = labels[labels.length - 1]
  const weeks = [labels[0]]
  while (weeks[weeks.length - 1] < last) {
    weeks.push(nextIsoWeek(weeks[weeks.length - 1]))
  }
  return weeks
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`

const tooltipRow = (label: string, value: string) =>
  `<div style="display:flex;justify-content:space-between;gap:1.5rem"><span>${label}</span><strong>${value}</strong></div>`

const workTypeSlot = (name: string) => {
  const slot = WORK_TYPES.indexOf(name)
  return slot === -1 ? WORK_TYPES.length : slot
}

const baseChartOption = (palette: ChartPalette, weeks: string[]) => ({
  animation: false,
  grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
  textStyle: { color: palette.text },
  tooltip: {
    trigger: "axis" as const,
    backgroundColor: palette.surface,
    borderColor: palette.grid,
    textStyle: { color: palette.text },
  },
  xAxis: {
    type: "category" as const,
    data: weeks,
    axisLabel: {
      color: palette.muted,
      hideOverlap: true,
      // The full week with its year is in the tooltip and the tables
      formatter: (week: string) => week.slice(5),
    },
    axisLine: { lineStyle: { color: palette.grid } },
    axisTick: { show: false },
  },
})

const valueAxis = (palette: ChartPalette, name: string) => ({
  type: "value" as const,
  name,
  min: 0,
  minInterval: 1,
  nameTextStyle: { color: palette.muted, align: "left" as const },
  axisLabel: { color: palette.muted },
  splitLine: { lineStyle: { color: palette.grid } },
})

export function throughputChartOption(
  throughput: ThroughputWeek[],
  palette: ChartPalette,
) {
  const weeks = continuousWeeks(throughput.map(({ week }) => week))
  const entryFor = (week: string) =>
    throughput.find((entry) => entry.week === week)
  const types = [
    ...new Set(
      throughput.flatMap(({ workTypes }) => workTypes.map(({ name }) => name)),
    ),
  ].sort((a, b) => workTypeSlot(a) - workTypeSlot(b))

  const stacks = types.map((name): ChartSeries => ({
    name,
    type: "bar",
    stack: "total",
    barMaxWidth: 48,
    // The border leaves a gap between segments, in the color of the card
    itemStyle: {
      color: palette.series[workTypeSlot(name)],
      borderColor: palette.surface,
      borderWidth: 1,
    },
    data: weeks.map(
      (week) =>
        entryFor(week)?.workTypes.find((type) => type.name === name)?.count ??
        0,
    ),
  }))
  // An invisible line that only carries the number above each bar
  const total: ChartSeries = {
    name: TOTAL,
    type: "line",
    symbolSize: 1,
    emphasis: { disabled: true },
    lineStyle: { opacity: 0 },
    itemStyle: { color: "transparent" },
    label: {
      show: true,
      position: "top",
      color: palette.text,
      fontWeight: "bold",
      formatter: ({ value }: { value: number }) => (value ? String(value) : ""),
    },
    data: weeks.map((week) => entryFor(week)?.count ?? 0),
  }

  const base = baseChartOption(palette, weeks)
  return {
    ...base,
    // Below the plot, where a legend that wraps on a phone cannot reach the axis name
    grid: { ...base.grid, bottom: 64 },
    legend: {
      bottom: 0,
      data: types,
      textStyle: { color: palette.text },
    },
    tooltip: {
      ...base.tooltip,
      axisPointer: { type: "shadow" as const },
      formatter: (points: TooltipPoint[]) =>
        [
          `<strong>${points[0].axisValue}</strong>`,
          ...points
            .filter(({ seriesName, value }) => seriesName !== TOTAL && value)
            .map(({ marker, seriesName, value }) =>
              tooltipRow(`${marker}${seriesName}`, String(value)),
            ),
          ...points
            .filter(({ seriesName }) => seriesName === TOTAL)
            .map(({ value }) => tooltipRow(TOTAL, String(value))),
        ].join(""),
    },
    yAxis: valueAxis(palette, "Completed"),
    series: [...stacks, total],
  }
}

export function cycleTimeChartOption(
  cycleTimeWeeks: CycleTimeWeek[],
  palette: ChartPalette,
) {
  const weeks = continuousWeeks(cycleTimeWeeks.map(({ week }) => week))
  const entries = new Map(cycleTimeWeeks.map((entry) => [entry.week, entry]))
  const base = baseChartOption(palette, weeks)

  return {
    ...base,
    tooltip: {
      ...base.tooltip,
      formatter: ([{ axisValue, value, marker }]: TooltipPoint[]) => {
        const count = entries.get(axisValue)?.count
        return [
          `<strong>${axisValue}</strong>`,
          value === null || value === undefined
            ? "No completed work"
            : tooltipRow(
                `${marker}Average`,
                `${value} ${value === 1 ? "day" : "days"}`,
              ),
          count ? `<div>${plural(count, "work item")}</div>` : "",
        ].join("")
      },
    },
    yAxis: valueAxis(palette, "Days"),
    series: [
      {
        name: "Average cycle time",
        type: "line" as const,
        symbol: "circle",
        symbolSize: 8,
        showSymbol: true,
        lineStyle: { width: 2, color: palette.series[0] },
        itemStyle: { color: palette.series[0] },
        label: { show: true, position: "top" as const, color: palette.text },
        labelLayout: { hideOverlap: true },
        data: weeks.map((week) => {
          const entry = entries.get(week)
          return entry ? roundDays(entry.averageDays) : null
        }),
      },
    ],
  }
}

/** Finished work anchors the bottom; upstream queues grow above it. */
export function cumulativeFlowChartOption(
  days: FlowDay[],
  palette: ChartPalette,
) {
  const boardStatuses: string[] = [
    STATUS.done,
    STATUS.deliveryInitiated,
    STATUS.inProgress,
    STATUS.ready,
    STATUS.backlog,
    STATUS.none,
  ]
  const statuses = [
    ...new Set([
      ...boardStatuses,
      ...days.flatMap(({ counts }) => Object.keys(counts)),
    ]),
  ].filter((status) => days.some(({ counts }) => counts[status] > 0))
  const base = baseChartOption(
    palette,
    days.map(({ date }) => date),
  )
  return {
    ...base,
    grid: { ...base.grid, bottom: 72 },
    xAxis: {
      ...base.xAxis,
      boundaryGap: false,
      axisLabel: {
        ...base.xAxis.axisLabel,
        formatter: (date: string) => date.slice(5),
      },
    },
    legend: {
      bottom: 0,
      type: "scroll" as const,
      textStyle: { color: palette.text },
    },
    tooltip: { ...base.tooltip, renderMode: "richText" as const },
    yAxis: valueAxis(palette, "Work items"),
    series: statuses.map((name, index) => ({
      name,
      type: "line" as const,
      stack: "statuses",
      symbol: days.length === 1 ? "circle" : "none",
      areaStyle: { opacity: 0.75 },
      itemStyle: {
        color:
          palette.series[
            (boardStatuses.includes(name)
              ? boardStatuses.indexOf(name)
              : index) % palette.series.length
          ],
      },
      data: days.map(({ counts }) => counts[name] ?? 0),
    })),
  }
}
