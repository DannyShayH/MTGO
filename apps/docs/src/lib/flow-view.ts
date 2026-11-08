import generatedMetrics from "../generated/flow-metrics.json"
import { roundDays, type FlowMetrics } from "../../scripts/flow-metrics.ts"

export const metrics = generatedMetrics as FlowMetrics
export const project = "https://github.com/users/DannyShayH/projects/2"
export const flowUrl = (path = "") =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/flow-metrics/${path}`
const timeZone = "Europe/Copenhagen"
export const observed = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(metrics.observedAt))
export const moment = (instant: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(instant))
export const historyStatuses = [
  ...new Set(
    metrics.cumulativeFlow.flatMap(({ counts }) => Object.keys(counts)),
  ),
]
const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
})
export const range = (start: string, end: string) =>
  `${day.format(new Date(start))} to ${day.format(new Date(end))}`
export const columns = [
  {
    id: "in-progress",
    label: "In Progress",
    kind: "wip",
    data: metrics.inProgress,
  },
  {
    id: "delivery-initiated",
    label: "Delivery Initiated",
    kind: "wip",
    data: metrics.deliveryInitiated,
  },
  { id: "ready", label: "Ready", kind: "queue", data: metrics.ready },
] as const
export const isSample = metrics.source === "sample"
export const scope = isSample ? "this sample" : "Project #2"
export const percent = (part: number, whole: number) =>
  Math.min(100, (part / whole) * 100)
export const days = (value: number) =>
  value === 0 ? "< 1 day" : `${value} ${value === 1 ? "day" : "days"}`
export const average = (value: number) =>
  `${roundDays(value)} ${value === 1 ? "day" : "days"}`
export { LIMITS } from "../../scripts/flow-metrics.ts"
