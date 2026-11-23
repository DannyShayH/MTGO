"use client"

import { CUSTOMER_CHECKOUT_TEXT, type Locale } from "@dtc/i18n"
import { PencilSquare } from "@medusajs/icons"
import { clx, focusRing } from "@modules/common/components/ui"

/**
 * One way back into a finished checkout step, the same in every step: a
 * quiet teal text button with a pencil, as tall as a touch target. Its name
 * says which step it edits ("Rediger leveringsadresse"), so a screen reader
 * list of buttons tells them apart.
 */
export default function StepEditButton({
  step,
  locale,
  onClick,
  "data-testid": testId,
}: {
  /** The step's heading, for the accessible name. */
  step: string
  locale: Locale
  onClick: () => void
  "data-testid"?: string
}) {
  const text = CUSTOMER_CHECKOUT_TEXT[locale]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={text.editStep.replace("{step}", step.toLowerCase())}
      className={clx(
        "-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-mtogo-text-link transition-[background-color,transform] duration-150 ease-out-strong motion-safe:active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-surface-selected",
        focusRing,
      )}
      data-testid={testId}
    >
      <PencilSquare aria-hidden="true" />
      {text.edit}
    </button>
  )
}
