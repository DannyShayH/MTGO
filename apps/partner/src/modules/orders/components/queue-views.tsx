import Link from "next/link"
import { ORDER_TEXT, type Locale } from "@dtc/i18n"
import { clx } from "@medusajs/ui"
import { ORDER_VIEWS, type OrderView } from "@lib/data/orders"

const LABELS = {
  awaiting: "view_awaiting",
  active: "view_active",
  history: "view_history",
} as const

/** The three views as links, so each view has its own address and history entry. */
export function QueueViews({
  current,
  locale,
}: {
  current: OrderView
  locale: Locale
}) {
  const text = ORDER_TEXT[locale]
  return (
    <nav aria-label={text.views} className="overflow-x-auto">
      <ul className="bg-ui-bg-subtle flex w-max gap-x-1 rounded-lg p-1">
        {ORDER_VIEWS.map((view) => (
          <li key={view}>
            <Link
              href={`/orders?view=${view}`}
              aria-current={view === current ? "page" : undefined}
              className={clx(
                "txt-compact-small-plus focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center whitespace-nowrap rounded-md px-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
                view === current
                  ? "bg-ui-bg-base text-ui-fg-base shadow-borders-base"
                  : "text-ui-fg-subtle hover:text-ui-fg-base",
              )}
            >
              {text[LABELS[view]]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
