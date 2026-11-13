"use client"

import { startTransition, useActionState, useOptimistic } from "react"
import type { Messages } from "@dtc/i18n"
import { Alert, Switch, clx } from "@medusajs/ui"
import { changeOpening } from "@lib/data/restaurant-opening"

/** The panel's colour says what Customers experience; the text says it too. */
const TONES = {
  receiving:
    "bg-mtogo-status-success-surface text-mtogo-status-success-text border-transparent",
  closed: "bg-ui-bg-subtle text-ui-fg-base border-ui-border-base",
  inactive:
    "bg-mtogo-status-warning-surface text-mtogo-status-warning-text border-transparent",
} as const

/**
 * The Open/Closed switch and the Receiving new Orders line, as one panel that
 * is readable at arm's length and tappable with busy hands (spec stories
 * 49-52, design brief). The whole panel toggles the switch. It moves at once
 * while the change is sent, then shows the state the backend reports, so a
 * refused change springs back next to its reason.
 */
export function OpeningSwitch({
  isActive,
  isOpen,
  isReceiving,
  statusLine,
  messages,
}: {
  isActive: boolean
  isOpen: boolean
  isReceiving: boolean
  statusLine: string
  messages: Messages
}) {
  const { text, codes } = messages
  const [state, dispatch, isPending] = useActionState(changeOpening, {})
  const [isShownOpen, showOpen] = useOptimistic(isOpen)
  const change = (isOpening: boolean) =>
    startTransition(() => {
      showOpen(isOpening)
      dispatch(isOpening)
    })
  const tone = !isActive ? "inactive" : isReceiving ? "receiving" : "closed"
  return (
    <div className="flex flex-col gap-y-3">
      <label
        htmlFor="restaurant-open"
        className={clx(
          "flex min-h-[76px] items-center justify-between gap-x-4 rounded-lg border px-4 py-3 motion-safe:transition-colors motion-safe:duration-200",
          TONES[tone],
          isActive ? "cursor-pointer" : "cursor-not-allowed",
        )}
      >
        <span className="flex min-w-0 flex-col gap-y-0.5">
          <span className="text-2xl font-semibold leading-tight">
            {isShownOpen ? text.open : text.closed}
          </span>
          <span
            className={clx(
              "text-sm font-medium motion-safe:transition-opacity",
              isPending && "opacity-60",
            )}
          >
            {statusLine}
          </span>
        </span>
        <Switch
          id="restaurant-open"
          aria-label={text.restaurant_open}
          aria-describedby={isActive ? undefined : "opening-unavailable"}
          checked={isShownOpen}
          disabled={!isActive || isPending}
          onCheckedChange={change}
          className="focus-visible:ring-mtogo-focus-ring shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2"
        />
      </label>
      {!isActive && (
        <p id="opening-unavailable" className="text-ui-fg-subtle text-sm">
          {text.open_requires_activation}
        </p>
      )}
      {state.error && (
        <Alert variant="error" role="alert">
          {codes[state.error]}
        </Alert>
      )}
    </div>
  )
}
