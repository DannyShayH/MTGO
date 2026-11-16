import { ShoppingCart } from "@medusajs/icons"

/**
 * The basket in the header: a cart icon with the number of items on a badge.
 * The link's name stays "Basket (2)" for screen readers and voice control,
 * and a changed count is announced.
 */
export default function CartIcon({
  label,
  count,
}: {
  label: string
  count: number
}) {
  return (
    <>
      <span className="relative inline-flex">
        <ShoppingCart aria-hidden="true" className="h-6 w-6" />
        {count > 0 && (
          <span
            // A new key replays the pop when the count changes.
            key={count}
            aria-hidden="true"
            className="absolute -right-2.5 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mtogo-action-primary px-1 text-xs font-semibold leading-none text-mtogo-text-on-primary motion-safe:animate-pop-in"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="sr-only" aria-live="polite">
        {`${label} (${count})`}
      </span>
    </>
  )
}

/** Shared by the loading fallback and the loaded basket link, so nothing jumps. */
export const cartLinkClassName =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-mtogo-text-primary transition-[color,transform] duration-150 ease-out-strong hover:text-mtogo-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 motion-safe:active:scale-[0.97]"
