import { RESTAURANT_RATINGS_TEXT } from "@dtc/i18n"
import { Skeleton } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

/** The Ratings page's shape while it loads: never "No ratings yet". */
export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex max-w-4xl flex-col gap-5"
    >
      <span className="sr-only">{RESTAURANT_RATINGS_TEXT[locale].loading}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full max-w-lg motion-reduce:animate-none" />
      </div>
      <Skeleton
        aria-hidden="true"
        className="h-12 w-full max-w-md rounded-lg motion-reduce:animate-none"
      />
      <Skeleton
        aria-hidden="true"
        className="rounded-card h-44 w-full motion-reduce:animate-none"
      />
    </div>
  )
}
