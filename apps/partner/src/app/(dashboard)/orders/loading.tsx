import { ORDER_TEXT } from "@dtc/i18n"
import { Skeleton } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

/** The Orders page's shape while it loads: header, toolbar, then the list. */
export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex max-w-4xl flex-col gap-5"
    >
      <span className="sr-only">{ORDER_TEXT[locale].loading}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full max-w-lg motion-reduce:animate-none" />
      </div>
      <Skeleton
        aria-hidden="true"
        className="rounded-card h-14 w-full motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="rounded-card bg-ui-bg-base shadow-borders-base divide-ui-border-base flex flex-col divide-y"
      >
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
          <Skeleton className="h-11 w-full max-w-md motion-reduce:animate-none" />
          <Skeleton className="h-11 w-full motion-reduce:animate-none" />
        </div>
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2 px-4 py-4 sm:px-6">
            <Skeleton className="h-6 w-40 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-64 max-w-full motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  )
}
