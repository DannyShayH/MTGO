"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { XMark } from "@medusajs/icons"
import { Button } from "@medusajs/ui"
import { PRESSABLE, type DeliveryCopy } from "./copy"

const ITEM = `text-mtogo-text-primary hover:bg-ui-bg-subtle focus-visible:ring-mtogo-focus-ring flex min-h-12 items-center rounded-lg px-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`

/**
 * The Delivery agent header: the MTOGO Partner logo (`brand`, rendered on
 * the server) and a burger menu with the agent's active delivery, available
 * work, recent completed deliveries and sign-out. The menu is a plain
 * disclosure: Escape or a tap on an item closes it, focus returns to the
 * button, and nothing relies on hover.
 */
export function DeliveryHeader({
  brand,
  agentName,
  copy,
  signOut,
}: Readonly<{
  brand: React.ReactNode
  agentName: string
  copy: DeliveryCopy
  signOut: () => Promise<void>
}>) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])
  const close = () => setOpen(false)
  return (
    <header className="relative flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          prefetch={false}
          href="/delivery"
          aria-label={copy.title}
          className="min-w-0"
        >
          {brand}
        </Link>
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls="delivery-menu"
          aria-label={open ? copy.menuClose : copy.menu}
          onClick={() => setOpen((value) => !value)}
          className={`border-mtogo-border-subtle bg-mtogo-surface-card focus-visible:ring-mtogo-focus-ring flex size-11 shrink-0 items-center justify-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`}
        >
          {open ? (
            <XMark aria-hidden />
          ) : (
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M3 5.5h14M3 10h14M3 14.5h14" />
            </svg>
          )}
        </button>
      </div>
      {open && (
        <nav
          id="delivery-menu"
          aria-label={copy.menu}
          className="border-mtogo-border-subtle bg-mtogo-surface-card absolute inset-x-0 top-full z-20 mt-2 flex flex-col gap-1 rounded-xl border p-2 shadow-lg"
        >
          <p className="text-mtogo-text-secondary break-words px-3 pb-1 pt-2 text-sm">
            {agentName}
          </p>
          <Link
            prefetch={false}
            href="/delivery#current"
            onClick={close}
            className={ITEM}
          >
            {copy.current}
          </Link>
          <Link
            prefetch={false}
            href="/delivery#available"
            onClick={close}
            className={ITEM}
          >
            {copy.available}
          </Link>
          <Link
            prefetch={false}
            href="/delivery/history"
            onClick={close}
            className={ITEM}
          >
            {copy.history}
          </Link>
          <form action={signOut} className="pt-1">
            <Button
              variant="secondary"
              type="submit"
              className={`min-h-12 w-full ${PRESSABLE}`}
            >
              {copy.signOut}
            </Button>
          </form>
        </nav>
      )}
    </header>
  )
}
