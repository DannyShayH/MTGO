import { drawChart } from "./draw-chart.ts"
import { throughputChartOption } from "./flow-chart-options.ts"

void drawChart("throughput-chart", (metrics, palette) =>
  throughputChartOption(metrics.throughput, palette),
)
