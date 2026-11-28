import { ChartNumbers as SharedChartNumbers } from "@dtc/charts"
import type { ComponentProps } from "react"

export { NO_VALUE, type ChartNumber } from "@dtc/charts"

/**
 * The shared numbers table under each chart (`@dtc/charts`), with the
 * Admin's English toggle (ADR-0018) and its focus style. The class names stay
 * here because the Admin's Tailwind build only reads `src/admin`.
 */
export function ChartNumbers(
  props: Omit<
    ComponentProps<typeof SharedChartNumbers>,
    "showLabel" | "hideLabel" | "className" | "toggleClassName"
  >,
) {
  return (
    <SharedChartNumbers
      {...props}
      showLabel="Show the numbers"
      hideLabel="Hide the numbers"
      className="px-6 py-3"
      toggleClassName="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm outline-none transition-colors"
    />
  )
}
