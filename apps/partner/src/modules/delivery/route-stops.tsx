import type { ReactNode } from "react"

/**
 * The journey as two stops on one line: pickup first, the Customer second.
 * The hollow and filled dots read as "from" and "to" even before the labels.
 */
export function RouteStops({
  pickupLabel,
  pickup,
  dropoffLabel,
  dropoff,
}: {
  pickupLabel: string
  pickup: ReactNode
  dropoffLabel: string
  dropoff: ReactNode
}) {
  return (
    <ol className="flex flex-col gap-4">
      <li className="relative flex gap-3">
        {/* From the pickup dot down to the Customer's dot: below this dot
            (0.375rem + 0.75rem) to the next dot's top (1rem gap + 0.375rem). */}
        <span
          aria-hidden
          className="bg-mtogo-border-subtle absolute -bottom-[1.375rem] left-[5px] top-[1.125rem] w-0.5"
        />
        <span
          aria-hidden
          className="border-mtogo-action-primary bg-mtogo-surface-card mt-1.5 size-3 shrink-0 rounded-full border-2"
        />
        <div className="min-w-0">
          <p className="text-mtogo-text-secondary text-sm">{pickupLabel}</p>
          <div className="text-mtogo-text-primary break-words text-base">
            {pickup}
          </div>
        </div>
      </li>
      <li className="relative flex gap-3">
        <span
          aria-hidden
          className="bg-mtogo-action-primary mt-1.5 size-3 shrink-0 rounded-full"
        />
        <div className="min-w-0">
          <p className="text-mtogo-text-secondary text-sm">{dropoffLabel}</p>
          <div className="text-mtogo-text-primary break-words text-base">
            {dropoff}
          </div>
        </div>
      </li>
    </ol>
  )
}
