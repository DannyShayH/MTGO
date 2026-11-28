"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowPath } from "@medusajs/icons"
import { Button } from "@medusajs/ui"

/**
 * Calculates the figures again (#264). The page never polls, so staff decide
 * when to read the current state; the figures stay in place meanwhile.
 */
export function RefreshButton({
  label,
  pendingLabel,
}: Readonly<{ label: string; pendingLabel: string }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="secondary"
      size="small"
      className="ease-out-strong min-h-11 transition-transform duration-150 motion-safe:active:scale-[0.97]"
      isLoading={isPending}
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <ArrowPath />
      {isPending ? pendingLabel : label}
    </Button>
  )
}
