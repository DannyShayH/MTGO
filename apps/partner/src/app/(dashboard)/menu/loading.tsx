import { MENU_TEXT } from "@dtc/i18n"
import { Container, Skeleton } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

export default async function Loading() {
  const { locale } = await getMessages()
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{MENU_TEXT[locale].loading}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-full max-w-lg motion-reduce:animate-none" />
      </div>
      <Container aria-hidden="true" className="rounded-card px-4 py-5 sm:px-6">
        <Skeleton className="h-6 w-32 motion-reduce:animate-none" />
        <Skeleton className="mt-3 h-5 w-full max-w-md motion-reduce:animate-none" />
        <Skeleton className="mt-7 h-5 w-28 motion-reduce:animate-none" />
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="mt-4 flex items-center gap-3 border-t border-ui-border-base pt-4"
          >
            <Skeleton className="h-14 w-11 shrink-0 motion-reduce:animate-none" />
            <Skeleton className="size-16 shrink-0 motion-reduce:animate-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-full max-w-40 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
            </div>
            <Skeleton className="hidden h-9 w-32 shrink-0 motion-reduce:animate-none sm:block" />
          </div>
        ))}
      </Container>
    </div>
  )
}
