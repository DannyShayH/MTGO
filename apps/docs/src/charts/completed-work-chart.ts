import { drawChart } from "./draw-chart.ts"
import { completedWorkChartOption } from "./flow-chart-options.ts"

void drawChart("completed-work-chart", (metrics, palette) =>
  completedWorkChartOption(metrics.dailyThroughput, palette),
)
