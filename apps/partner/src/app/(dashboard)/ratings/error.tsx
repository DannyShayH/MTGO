"use client"

import { startTransition, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { isLocale, RESTAURANT_RATINGS_TEXT, type Locale } from "@dtc/i18n"
import { Button, Container, Heading, Text } from "@medusajs/ui"

const subscribeToNothing = () => () => {}
/** The root layout sets `<html lang>` from the staff member's language. */
const documentLocale = (): Locale => {
  const lang = document.documentElement.lang
  return isLocale(lang) ? lang : "da"
}

/** A failed ratings read, never shown as "No ratings yet". */
export default function RatingsError({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const router = useRouter()
  const locale = useSyncExternalStore(
    subscribeToNothing,
    documentLocale,
    (): Locale => "da",
  )
  const text = RESTAURANT_RATINGS_TEXT[locale]
  return (
    <Container className="rounded-card max-w-xl" role="alert">
      <Heading level="h1">{text.unavailable_title}</Heading>
      <Text className="text-ui-fg-subtle mt-2">{text.retry_hint}</Text>
      <Button
        variant="secondary"
        className="mt-4 min-h-11"
        onClick={() =>
          startTransition(() => {
            router.refresh()
            reset()
          })
        }
      >
        {text.retry}
      </Button>
    </Container>
  )
}
