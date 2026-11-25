"use client"

import { InformationCircle } from "@medusajs/icons"
import { IconButton, Popover } from "@medusajs/ui"
import type { ReactNode } from "react"

/**
 * An explanation staff read a few times and then rarely need (#228): a
 * Medusa UI information button that opens it in a popover, by pointer, touch
 * or keyboard, and closes on Escape or outside. `label` names the button for
 * screen readers.
 */
export function InfoPopover({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Popover>
      <Popover.Trigger asChild>
        <IconButton
          size="2xsmall"
          variant="transparent"
          aria-label={label}
          title={label}
          // A bigger hit area than the icon, for touch.
          className="text-ui-fg-muted hover:text-ui-fg-subtle focus-visible:ring-mtogo-focus-ring relative after:absolute after:-inset-2 focus-visible:outline-none focus-visible:ring-2"
        >
          <InformationCircle />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 p-4 focus-visible:outline-none"
      >
        {children}
      </Popover.Content>
    </Popover>
  )
}
