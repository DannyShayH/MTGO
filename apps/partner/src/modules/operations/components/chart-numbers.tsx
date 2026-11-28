"use client"

import { ChartNumbers as SharedChartNumbers } from "@dtc/charts"
import type { ComponentProps } from "react"

export { NO_VALUE } from "@dtc/charts"

/**
 * The shared numbers table under each chart (`@dtc/charts`), with the
 * partner app's toggle: a 44px touch target and the MTOGO focus ring (design
 * brief). The words come from the caller, in the Restaurant's language.
 */
export function ChartNumbers(
  props: Omit<
    ComponentProps<typeof SharedChartNumbers>,
    "className" | "toggleClassName"
  >,
) {
  return (
    <SharedChartNumbers
      {...props}
      className="px-4 py-1 sm:px-6"
      toggleClassName="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    />
  )
}
