/** Shapes of the menu while it loads; the language is not known yet, so no text. */
export default function Loading() {
  return (
    <div className="bg-mtogo-surface-page" aria-busy="true">
      <div className="content-container flex min-h-[60vh] max-w-3xl flex-col gap-6 py-8 small:py-12">
        <div className="h-5 w-40 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
        <div className="grid gap-4 small:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="flex flex-col gap-4">
            <div className="h-9 w-2/3 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-mtogo-surface-selected motion-reduce:animate-none" />
            <div className="h-5 w-full max-w-md animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
          </div>
          <div className="aspect-video w-full animate-pulse rounded-card bg-mtogo-surface-selected motion-reduce:animate-none" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-20 animate-pulse rounded-full bg-mtogo-surface-card motion-reduce:animate-none" />
          <div className="h-11 w-28 animate-pulse rounded-full bg-mtogo-surface-card motion-reduce:animate-none" />
        </div>
        <div className="h-7 w-28 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
        <div className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card px-4">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex items-center gap-4 border-b border-mtogo-border-subtle py-5 last:border-b-0"
            >
              <div className="flex flex-1 flex-col gap-3">
                <div className="h-5 w-1/2 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
                <div className="h-5 w-20 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
              </div>
              <div className="h-20 w-24 shrink-0 animate-pulse rounded-card bg-mtogo-surface-selected motion-reduce:animate-none small:h-28 small:w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
