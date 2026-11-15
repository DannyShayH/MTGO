"use client"

import { useState } from "react"

export function PhotoWithPlaceholder({
  url,
  name,
  missingText,
  kind,
}: {
  url: string | null | undefined
  name: string
  missingText: string
  kind: "dish" | "cover"
}) {
  const [failed, setFailed] = useState(false)
  const isCover = kind === "cover"
  if (url && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={isCover ? "" : name}
        onError={() => setFailed(true)}
        className={
          isCover
            ? "aspect-video w-full object-cover"
            : "aspect-[4/3] w-24 shrink-0 self-start rounded-card object-cover small:w-36"
        }
      />
    )
  return (
    <div
      className={
        isCover
          ? "flex aspect-video w-full items-center justify-center bg-mtogo-surface-selected px-6"
          : "flex aspect-[4/3] w-24 shrink-0 items-center justify-center self-start rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-2 small:w-36"
      }
      data-testid={
        isCover ? "restaurant-cover-placeholder" : "menu-dish-placeholder"
      }
    >
      <span className="sr-only">{missingText}</span>
      <span
        aria-hidden="true"
        className={
          isCover
            ? "line-clamp-3 text-balance text-center text-2xl font-semibold leading-tight text-mtogo-text-link"
            : "line-clamp-3 text-center text-xs leading-4 text-mtogo-text-secondary"
        }
      >
        {name}
      </span>
    </div>
  )
}
