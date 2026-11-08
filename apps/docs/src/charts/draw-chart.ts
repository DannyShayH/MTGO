import { BarChart, LineChart } from "echarts/charts"
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components"
import { init, use } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import type { EChartsCoreOption } from "echarts/core"
import type { FlowMetrics } from "../../scripts/flow-metrics.ts"
import type { ChartPalette } from "./flow-chart-options.ts"

use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

const metricsUrl = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/flow-metrics.json`
// Shared by all charts, and only requested when a chart is on the page
let metrics: Promise<FlowMetrics> | undefined
const loadMetrics = () =>
  (metrics ??= fetch(metricsUrl).then((response) => {
    if (!response.ok) throw new Error(`${metricsUrl}: ${response.status}`)
    return response.json() as Promise<FlowMetrics>
  }))

function readPalette(element: Element): ChartPalette {
  const styles = getComputedStyle(element)
  const token = (name: string) => styles.getPropertyValue(name).trim()
  return {
    text: token("--sl-color-white"),
    muted: token("--sl-color-gray-3"),
    grid: token("--sl-color-hairline-light"),
    surface: token("--sl-color-bg-nav"),
    series: [1, 2, 3, 4, 5, 6].map((slot) => token(`--flow-chart-${slot}`)),
  }
}

/** Draws a chart from the published metrics, and redraws it when the theme or width changes */
export async function drawChart(
  id: string,
  buildOption: (
    metrics: FlowMetrics,
    palette: ChartPalette,
  ) => EChartsCoreOption,
) {
  const element = document.getElementById(id)
  if (!element) return
  try {
    const data = await loadMetrics()
    const chart = init(element)
    const draw = () =>
      chart.setOption(buildOption(data, readPalette(element)), true)
    draw()
    new ResizeObserver(() => chart.resize()).observe(element)
    new MutationObserver(draw).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
  } catch (error) {
    console.error(error)
    element.removeAttribute("role")
    element.removeAttribute("aria-label")
    element.classList.add("flow-chart-error")
    element.textContent =
      "The chart could not be loaded. Open the table below or visit Work items for the numbers."
  }
}
