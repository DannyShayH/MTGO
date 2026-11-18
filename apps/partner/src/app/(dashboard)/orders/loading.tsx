import { ORDER_TEXT } from "@dtc/i18n"
import { Skeleton } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{ORDER_TEXT[locale].loading}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full max-w-lg motion-reduce:animate-none" />
      </div>
      <Skeleton
        aria-hidden="true"
        className="h-11 w-full max-w-md motion-reduce:animate-none"
      />
      <div aria-hidden="true" className="flex max-w-3xl flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            className="rounded-card h-36 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  )
}
