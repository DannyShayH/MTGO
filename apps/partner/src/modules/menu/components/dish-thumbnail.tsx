"use client"

import { useState } from "react"
import { XMark } from "@medusajs/icons"

/** A small, steady visual anchor beside a dish's name in the staff menu. */
export function DishThumbnail({
  url,
  noImage,
}: {
  url?: string | null
  noImage: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-mtogo-border-subtle bg-mtogo-surface-page">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex flex-col items-center gap-0.5 px-1 text-center text-xs leading-3 text-mtogo-text-secondary">
          <XMark aria-hidden className="size-4" />
          {noImage}
        </span>
      )}
    </div>
  )
}
