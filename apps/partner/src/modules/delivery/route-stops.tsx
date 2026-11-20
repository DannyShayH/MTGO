import type { ReactNode } from "react"
import { BuildingStorefront, MapPin } from "@medusajs/icons"

/** Through the 1.5rem markers' centre: 12px less half the 2px line. */
const LINE = "bg-mtogo-border-subtle absolute left-[11px] w-0.5"

/**
 * The journey as two stops on one line: the Restaurant first, the Customer
 * second. A storefront in an outlined circle and a pin in a filled one read
 * as "from" and "to" before the labels. `leg` sits on the line between them
 * (the trip length, #191) and `pickupAside` beside the pickup label (how far
 * the agent is from it).
 */
export function RouteStops({
  pickupLabel,
  pickup,
  pickupAside,
  leg,
  dropoffLabel,
  dropoff,
}: {
  pickupLabel: string
  pickup: ReactNode
  pickupAside?: ReactNode
  leg?: ReactNode
  dropoffLabel: string
  dropoff: ReactNode
}) {
  return (
    <ol className="flex flex-col gap-4">
      <li className="relative flex gap-3">
        {/* From below the marker through the 1rem gap to the next row. */}
        <span aria-hidden className={`${LINE} -bottom-4 top-6`} />
        <span
          aria-hidden
          className="border-mtogo-action-primary bg-mtogo-surface-card text-mtogo-action-primary flex size-6 shrink-0 items-center justify-center rounded-full border-2 [&_svg]:size-3.5"
        >
          <BuildingStorefront />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-mtogo-text-secondary text-sm leading-6">
              {pickupLabel}
            </p>
            {pickupAside}
          </div>
          <div className="text-mtogo-text-primary break-words text-base">
            {pickup}
          </div>
        </div>
      </li>
      {leg && (
        <li className="relative flex">
          <span aria-hidden className={`${LINE} -bottom-4 top-0`} />
          <div className="ml-9 min-w-0">{leg}</div>
        </li>
      )}
      <li className="relative flex gap-3">
        <span
          aria-hidden
          className="bg-mtogo-action-primary text-mtogo-text-on-primary flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5"
        >
          <MapPin />
        </span>
        <div className="min-w-0">
          <p className="text-mtogo-text-secondary text-sm leading-6">
            {dropoffLabel}
          </p>
          <div className="text-mtogo-text-primary break-words text-base">
            {dropoff}
          </div>
        </div>
      </li>
    </ol>
  )
}
