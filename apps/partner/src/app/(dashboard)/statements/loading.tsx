import { RESTAURANT_STATEMENTS_TEXT } from "@dtc/i18n"
import { Skeleton } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

/** The Statements page's shape while it loads: never an empty month. */
export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex max-w-6xl flex-col gap-5"
    >
      <span className="sr-only">
        {RESTAURANT_STATEMENTS_TEXT[locale].loading}
      </span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full max-w-lg motion-reduce:animate-none" />
      </div>
      <Skeleton
        aria-hidden="true"
        className="rounded-card h-20 w-full motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton
            key={index}
            className="rounded-card h-20 motion-reduce:animate-none"
          />
        ))}
      </div>
      <Skeleton
        aria-hidden="true"
        className="rounded-card h-48 w-full motion-reduce:animate-none"
      />
    </div>
  )
}
