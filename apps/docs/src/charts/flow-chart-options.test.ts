import { describe, expect, it } from "vitest"
import {
  cycleTimeChartOption,
  throughputChartOption,
} from "./flow-chart-options.ts"

const week = (name: string, types: Record<string, number>) => ({
  week: name,
  count: Object.values(types).reduce((total, count) => total + count, 0),
  workTypes: Object.entries(types).map(([typeName, count]) => ({
    name: typeName,
    count,
  })),
})

const colors = (series: { name: string; itemStyle: { color?: string } }[]) =>
  Object.fromEntries(series.map((s) => [s.name, s.itemStyle.color]))
const palette = {
  text: "#111111",
  muted: "#555555",
  grid: "#dddddd",
  surface: "#ffffff",
  series: ["#000001", "#000002", "#000003", "#000004"],
}
const point = (seriesName: string, value: number | null) => ({
  seriesName,
  value,
  marker: "*",
  axisValue: "2026-W45",
})

describe("throughput chart", () => {
  it("stacks one series per work type with each week's count", () => {
    const option = throughputChartOption(
      [
        week("2026-W45", { development: 5 }),
        week("2026-W46", { rework: 1, development: 2 }),
      ],
      palette,
    )

    expect(option.xAxis.data).toEqual(["2026-W45", "2026-W46"])
    expect(
      option.series
        .filter(({ stack }) => stack)
        .map(({ name, data, stack, type }) => ({ name, data, stack, type })),
    ).toEqual([
      { name: "development", data: [5, 2], stack: "total", type: "bar" },
      { name: "rework", data: [0, 1], stack: "total", type: "bar" },
    ])
  })

  it("shows a week without completed work as zero", () => {
    const option = throughputChartOption(
      [
        week("2026-W45", { development: 5 }),
        week("2026-W47", { development: 1 }),
      ],
      palette,
    )

    expect(option.xAxis.data).toEqual(["2026-W45", "2026-W46", "2026-W47"])
    expect(option.series[0].data).toEqual([5, 0, 1])
  })

  it("keeps the week sequence across an ISO year with 53 weeks", () => {
    const option = throughputChartOption(
      [
        week("2026-W52", { development: 1 }),
        week("2027-W01", { development: 1 }),
      ],
      palette,
    )

    expect(option.xAxis.data).toEqual(["2026-W52", "2026-W53", "2027-W01"])
  })

  it("gives a work type the same color whichever types are present", () => {
    const withRework = throughputChartOption(
      [week("2026-W45", { rework: 1, development: 1 })],
      palette,
    )
    const withoutDevelopment = throughputChartOption(
      [week("2026-W45", { rework: 1 })],
      palette,
    )

    expect(colors(withRework.series).rework).toBe(
      colors(withoutDevelopment.series).rework,
    )
    expect(colors(withRework.series).rework).not.toBe(
      colors(withRework.series).development,
    )
  })

  it("labels each week with its total, without adding it to the legend", () => {
    const option = throughputChartOption(
      [
        week("2026-W45", { rework: 1, development: 2 }),
        week("2026-W47", { development: 4 }),
      ],
      palette,
    )

    const total = option.series.find(({ name }) => name === "Total")
    expect(total?.data).toEqual([3, 0, 4])
    expect(option.legend.data).toEqual(["development", "rework"])
  })

  it("lists only the work types present in a week in the tooltip", () => {
    const option = throughputChartOption(
      [week("2026-W45", { development: 2 })],
      palette,
    )

    const text = option.tooltip.formatter([
      point("development", 2),
      point("rework", 0),
      point("Total", 2),
    ])
    expect(text).toContain("2026-W45")
    expect(text).toContain("development")
    expect(text).not.toContain("rework")
    expect(text).toContain("Total")
  })

  it("shortens the axis label to the week number", () => {
    const option = throughputChartOption(
      [week("2026-W45", { development: 1 })],
      palette,
    )

    expect(option.xAxis.axisLabel.formatter("2026-W45")).toBe("W45")
  })
})

describe("cycle time chart", () => {
  it("plots the average per closing week as the table rounds it", () => {
    const option = cycleTimeChartOption(
      [
        { week: "2026-W45", averageDays: 0, count: 4 },
        { week: "2026-W46", averageDays: 7 / 3, count: 3 },
      ],
      palette,
    )

    expect(option.xAxis.data).toEqual(["2026-W45", "2026-W46"])
    expect(option.series[0].data).toEqual([0, 2.3])
  })

  it("leaves a gap for a week with no completed work instead of zero", () => {
    const option = cycleTimeChartOption(
      [
        { week: "2026-W45", averageDays: 1, count: 1 },
        { week: "2026-W47", averageDays: 2, count: 1 },
      ],
      palette,
    )

    expect(option.xAxis.data).toEqual(["2026-W45", "2026-W46", "2026-W47"])
    expect(option.series[0].data).toEqual([1, null, 2])
  })

  it("shows how many work items the average is based on", () => {
    const option = cycleTimeChartOption(
      [{ week: "2026-W45", averageDays: 2.25, count: 4 }],
      palette,
    )

    const text = option.tooltip.formatter([
      { ...point("Average cycle time", 2.3), axisValue: "2026-W45" },
    ])
    expect(text).toContain("2.3 days")
    expect(text).toContain("4 work items")
  })

  it("says so when a week has no completed work", () => {
    const option = cycleTimeChartOption(
      [{ week: "2026-W44", averageDays: 1, count: 1 }],
      palette,
    )

    const text = option.tooltip.formatter([point("Average cycle time", null)])
    expect(text).toContain("No completed work")
  })
})
