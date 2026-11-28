import { RESTAURANT_OPERATIONS_TEXT } from "@dtc/i18n"
import { Skeleton } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

/** The Operations page's shape while it loads: never zeros (#264). */
export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex max-w-6xl flex-col gap-6"
    >
      <span className="sr-only">
        {RESTAURANT_OPERATIONS_TEXT[locale].loading}
      </span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full max-w-lg motion-reduce:animate-none" />
      </div>
      <Skeleton
        aria-hidden="true"
        className="rounded-card h-72 w-full motion-reduce:animate-none"
      />
      <div aria-hidden="true" className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="rounded-card h-64 w-full motion-reduce:animate-none" />
        <Skeleton className="rounded-card h-64 w-full motion-reduce:animate-none lg:col-span-2" />
      </div>
    </div>
  )
}
