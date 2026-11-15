"use client"

import { useId, useState } from "react"
import { InformationCircle } from "@medusajs/icons"

/** Explanation available to pointer, keyboard and touch users. */
export function LabelInfo({
  name,
  description,
}: {
  name: string
  description: string
}) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned
  const id = useId()
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPinned(false)
          setHovered(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          setPinned(false)
          setHovered(false)
        }
      }}
    >
      <button
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setPinned((value) => !value)
          setHovered(false)
        }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-mtogo-text-secondary hover:text-mtogo-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-mtogo-focus-ring"
      >
        <InformationCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
      </button>
      <span
        id={id}
        hidden={!open}
        className="absolute right-0 top-full z-10 w-56 max-w-[70vw] rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-3 text-sm font-normal leading-5 text-mtogo-text-secondary shadow-md"
      >
        {description}
      </span>
    </span>
  )
}
