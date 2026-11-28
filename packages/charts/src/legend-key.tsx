import { Text } from "@medusajs/ui"
import type { ReactNode } from "react"

/** The two time series (#262): never told apart by colour alone. */
export const PROCESSING_COLOR = "var(--fg-interactive)"
export const TRANSIT_COLOR = "var(--tag-purple-icon)"

export type LegendMark = "bar" | "partial" | "line" | "processing" | "transit"

/** A legend mark, 14 by 10, drawn the way its chart draws the series. */
function LegendMarkShape({ mark }: Readonly<{ mark: LegendMark }>) {
  switch (mark) {
    case "line":
      return (
        <line
          x1="0"
          x2="14"
          y1="5"
          y2="5"
          stroke="var(--fg-base)"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
      )
    case "processing":
      return (
        <>
          <line
            x1="0"
            x2="14"
            y1="5"
            y2="5"
            stroke={PROCESSING_COLOR}
            strokeWidth="2"
          />
          <circle cx="7" cy="5" r="3" fill={PROCESSING_COLOR} />
        </>
      )
    case "transit":
      return (
        <>
          <line
            x1="0"
            x2="14"
            y1="5"
            y2="5"
            stroke={TRANSIT_COLOR}
            strokeWidth="2"
            strokeDasharray="3 2"
          />
          <rect x="4.5" y="2.5" width="5" height="5" fill={TRANSIT_COLOR} />
        </>
      )
    default:
      return (
        <rect
          x="1"
          y="1"
          width="12"
          height="8"
          rx="2"
          fill="var(--fg-interactive)"
          fillOpacity={mark === "partial" ? 0.35 : 1}
          stroke={mark === "partial" ? "var(--fg-interactive)" : "none"}
          strokeDasharray="3 2"
        />
      )
  }
}

/** One key of a chart legend: a small mark drawn like the chart draws it. */
export function LegendKey({
  mark,
  children,
}: Readonly<{ mark: LegendMark; children: ReactNode }>) {
  return (
    <div className="flex items-center gap-x-1.5">
      <svg aria-hidden="true" width="14" height="10" className="shrink-0">
        <LegendMarkShape mark={mark} />
      </svg>
      <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
        {children}
      </Text>
    </div>
  )
}
