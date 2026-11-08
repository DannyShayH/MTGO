import { drawChart } from "./draw-chart.ts"
import { cycleTimeChartOption } from "./flow-chart-options.ts"

void drawChart("cycle-time-chart", (metrics, palette) =>
  cycleTimeChartOption(metrics.cycleTimeWeeks, palette),
)
