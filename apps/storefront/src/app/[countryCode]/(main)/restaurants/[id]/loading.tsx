/** Shapes of the menu while it loads; the language is not known yet, so no text. */
export default function Loading() {
  return (
    <div className="bg-mtogo-surface-page" aria-busy="true">
      <div className="content-container flex min-h-[60vh] max-w-3xl flex-col gap-6 py-8 small:py-12">
        <div className="h-10 w-2/3 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
        <div className="h-5 w-1/2 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-card bg-mtogo-surface-card motion-reduce:animate-none" />
      </div>
    </div>
  )
}
