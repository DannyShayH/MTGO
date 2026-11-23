"use client"

import { useRouter } from "next/navigation"
import { createContext, useContext, useTransition } from "react"

type QueueNavigation = {
  navigate: (href: string) => void
  isPending: boolean
}

const QueueNavigationContext = createContext<QueueNavigation | null>(null)

/**
 * Filter changes replace the address (no history entry per keystroke) and
 * keep the scroll position, inside one transition, so the current results
 * stay on screen until the new ones arrive.
 */
export function QueueTransitionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const navigate = (href: string) =>
    startTransition(() => router.replace(href, { scroll: false }))
  return (
    <QueueNavigationContext.Provider value={{ navigate, isPending }}>
      {children}
    </QueueNavigationContext.Provider>
  )
}

export const useQueueNavigation = () => {
  const navigation = useContext(QueueNavigationContext)
  if (!navigation)
    throw new Error("useQueueNavigation needs a QueueTransitionProvider")
  return navigation
}

/**
 * The results while a filter loads: they stay readable and only dim, and
 * only after 150 ms, so a fast answer never flickers. Opacity alone, so
 * reduced motion needs no exception.
 */
export function QueueResults({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isPending } = useQueueNavigation()
  return (
    <div
      aria-busy={isPending}
      data-pending={isPending}
      className="ease-out-strong transition-opacity duration-150 data-[pending=true]:opacity-50 data-[pending=true]:delay-150"
    >
      {children}
    </div>
  )
}
