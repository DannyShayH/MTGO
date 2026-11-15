"use client"

import { ChevronDownMini, ChevronUpMini } from "@medusajs/icons"
import { MENU_ARRANGEMENT_TEXT, type Locale } from "@dtc/i18n"

/**
 * A stacked up/down pair. The ends of the list are dimmed; a save in progress
 * only blocks input, so the whole list does not flicker on every press.
 */
export function ReorderControls({
  name,
  index,
  count,
  disabled,
  locale,
  onMove,
}: {
  name: string
  index: number
  count: number
  disabled: boolean
  locale: Locale
  onMove: (offset: -1 | 1) => void
}) {
  const text = MENU_ARRANGEMENT_TEXT[locale]
  return (
    <div
      role="group"
      aria-label={name}
      className="flex shrink-0 flex-col divide-y divide-ui-border-base self-start overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-sm"
    >
      {([-1, 1] as const).map((offset) => {
        const edge = offset === -1 ? index === 0 : index === count - 1
        return (
          <button
            key={offset}
            type="button"
            aria-label={`${offset === -1 ? text.up : text.down}: ${name}`}
            title={offset === -1 ? text.up : text.down}
            aria-disabled={edge || disabled}
            data-edge={edge}
            onClick={() => {
              if (!edge && !disabled) onMove(offset)
            }}
            className="inline-flex h-11 w-11 items-center justify-center text-ui-fg-subtle transition-colors duration-150 ease-out active:bg-ui-bg-subtle-pressed aria-disabled:cursor-default aria-disabled:active:bg-transparent data-[edge=true]:text-ui-fg-disabled focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mtogo-focus-ring motion-reduce:transition-none [@media(hover:hover)]:hover:bg-ui-bg-subtle-hover [@media(hover:hover)]:hover:text-ui-fg-base [@media(hover:hover)]:aria-disabled:hover:bg-transparent [@media(hover:hover)]:data-[edge=true]:hover:text-ui-fg-disabled"
          >
            {offset === -1 ? (
              <ChevronUpMini aria-hidden />
            ) : (
              <ChevronDownMini aria-hidden />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function reordered(ids: string[], index: number, offset: -1 | 1) {
  const result = [...ids]
  const previous = result[index]
  result[index] = result[index + offset]
  result[index + offset] = previous
  return result
}
