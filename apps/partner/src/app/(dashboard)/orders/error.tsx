"use client"

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import { useRouter } from "next/navigation"
import { isLocale, MESSAGES, ORDER_TEXT, type Locale } from "@dtc/i18n"
import { Button, Container, Heading } from "@medusajs/ui"
import { backoffMs } from "@modules/orders/connection"
import { fetchOrdersCheck } from "@modules/orders/orders-check"

const RETRY_MS = 5000
const RETRY_MAX_MS = 60_000

const subscribeToNothing = () => () => {}
/** The root layout sets `<html lang>` from the staff member's language. */
const documentLocale = (): Locale => {
  const lang = document.documentElement.lang
  return isLocale(lang) ? lang : "da"
}

/**
 * An Orders page that failed to render, typically because the backend was
 * down when the kitchen screen reread itself (#148). Instead of a dead
 * screen it probes the authorized Orders check with backoff and renders the
 * page again once the backend answers; staff can also try at once.
 */
export default function OrdersError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const router = useRouter()
  const locale = useSyncExternalStore(
    subscribeToNothing,
    documentLocale,
    (): Locale => "da",
  )
  const [attempt, setAttempt] = useState(1)

  const retry = useCallback(
    () =>
      startTransition(() => {
        router.refresh()
        reset()
      }),
    [router, reset],
  )

  useEffect(() => {
    const timer = setTimeout(
      async () => {
        const { status } = await fetchOrdersCheck()
        if (status === "unavailable") setAttempt((previous) => previous + 1)
        else retry()
      },
      backoffMs(RETRY_MS, attempt, RETRY_MAX_MS),
    )
    return () => clearTimeout(timer)
  }, [attempt, retry])

  return (
    <Container className="rounded-card max-w-xl" role="alert">
      <Heading level="h1">{MESSAGES[locale].codes.unknown_error}</Heading>
      <Button variant="secondary" className="mt-4 min-h-11" onClick={retry}>
        {ORDER_TEXT[locale].try_again}
      </Button>
    </Container>
  )
}
