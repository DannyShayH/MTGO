import { drawChart } from "./draw-chart.ts"
import { cumulativeFlowChartOption } from "./flow-chart-options.ts"

void drawChart("cumulative-flow-chart", (metrics, palette) =>
  cumulativeFlowChartOption(metrics.cumulativeFlow, palette),
)
