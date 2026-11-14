/** The homepage's shapes while the Restaurants load; the language is not known yet, so no text. */
export default function Loading() {
  return (
    <div className="bg-mtogo-surface-page" aria-busy="true">
      <div className="bg-mtogo-action-primary">
        <div className="content-container flex max-w-3xl flex-col gap-6 py-10 small:py-16">
          <div className="h-10 w-3/4 animate-pulse rounded-card bg-mtogo-action-primary-hover motion-reduce:animate-none" />
          <div className="h-7 w-1/2 animate-pulse rounded-card bg-mtogo-action-primary-hover motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-md bg-mtogo-action-primary-hover motion-reduce:animate-none" />
        </div>
      </div>
      <div className="content-container flex flex-col gap-6 py-8 small:py-12">
        <div className="h-8 w-48 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
        <ul className="grid grid-cols-1 gap-5 xsmall:grid-cols-2 small:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <li
              key={index}
              className="overflow-hidden rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card"
            >
              <div className="aspect-video animate-pulse bg-mtogo-surface-selected motion-reduce:animate-none" />
              <div className="flex flex-col gap-3 p-4">
                <div className="h-6 w-2/3 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
                <div className="h-5 w-1/3 animate-pulse rounded-card bg-mtogo-border-subtle motion-reduce:animate-none" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
