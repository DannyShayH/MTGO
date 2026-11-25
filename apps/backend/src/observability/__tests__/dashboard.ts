import { readFileSync } from "node:fs"
import { join } from "node:path"

type ThresholdStep = { color: string; value: number | null }

export type Panel = {
  title: string
  type: string
  collapsed?: boolean
  panels?: Panel[]
  gridPos: { h: number; w: number; x: number; y: number }
  description?: string
  options?: { content?: string }
  targets?: { expr: string; legendFormat?: string; instant?: boolean }[]
  fieldConfig?: {
    defaults: {
      unit?: string
      min?: number
      max?: number
      noValue?: string
      color?: { mode: string; fixedColor?: string }
      custom?: { spanNulls?: boolean; thresholdsStyle?: { mode: string } }
      thresholds?: { steps: ThresholdStep[] }
    }
  }
}

type Dashboard = {
  refresh: string
  editable: boolean
  links: unknown[]
  annotations: { list: { name: string; expr: string }[] }
  templating: { list: { name: string; options?: { value: string }[] }[] }
  panels: Panel[]
}

/** The colour of a value that has no target, and of one that is Unavailable. */
export const NEUTRAL = "#B8BEC9"

/** The provisioned request dashboard. */
export function readRequestDashboard(): Dashboard {
  return JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../../../../deploy/monitoring/grafana/dashboards/backend-requests.json",
      ),
      "utf8",
    ),
  )
}

/** The colour Grafana gives a value: the last step it reaches, or the base step without a value. */
export function pickColor(steps: ThresholdStep[], value: number | null) {
  const reached = steps.filter(
    (step) => step.value === null || (value !== null && value >= step.value),
  )
  return reached[reached.length - 1].color
}
