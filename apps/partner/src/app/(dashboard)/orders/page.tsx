import Link from "next/link"
import { formatOrderTime, formatText, ORDER_TEXT } from "@dtc/i18n"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { listOrders, ORDERS_PAGE_SIZE } from "@lib/data/orders"
import {
  hasFilters,
  parseQueueQuery,
  placementWindow,
  queueHref,
  withoutFilters,
} from "@lib/order-queue"
import { OrderCard } from "@modules/orders/components/order-card"
import { QueueViews } from "@modules/orders/components/queue-views"
import { LiveOrders } from "@modules/orders/components/live-orders"
import { OrderFilters } from "@modules/orders/components/order-filters"
import {
  QueueResults,
  QueueTransitionProvider,
} from "@modules/orders/components/queue-transition"

/** Medusa UI's secondary button, as a link. */
const LINK_BUTTON =
  "bg-ui-button-neutral text-ui-fg-base shadow-buttons-neutral hover:bg-ui-button-neutral-hover active:bg-ui-button-neutral-pressed focus-visible:ring-mtogo-focus-ring txt-compact-small-plus ease-out-strong inline-flex min-h-11 items-center justify-center rounded-md px-4 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:active:scale-[0.97]"

const EMPTY = {
  awaiting: "empty_awaiting",
  active: "empty_active",
  history: "empty_history",
} as const

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCurrentStaff()
  const { locale } = await getMessages()
  const text = ORDER_TEXT[locale]
  const query = parseQueueQuery(await searchParams)
  const { view, page } = query
  // Days are the Restaurant's Copenhagen days, worked out on the server.
  const placement = placementWindow(query, new Date())
  const isRangeInvalid = placement === "invalid"
  const result = isRangeInvalid
    ? undefined
    : await listOrders(view, (page - 1) * ORDERS_PAGE_SIZE, {
        q: query.q,
        ...placement,
        cancellation_category: query.cancellation_category,
        delivery_outcome: query.delivery_outcome,
      })
  const pages = result
    ? Math.max(1, Math.ceil(result.count / ORDERS_PAGE_SIZE))
    : 1
  const isFiltered = hasFilters(query)
  const clearHref = withoutFilters(query)

  return (
    // One column at every width, so the toolbar stays next to the queue it
    // controls and the deadline order reads the same everywhere.
    <div className="flex max-w-4xl flex-col gap-5">
      <header>
        <Heading level="h1">{text.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2 max-w-prose">{text.intro}</Text>
      </header>
      <LiveOrders
        locale={locale}
        loaded={
          result
            ? formatText(text.checked_at, {
                time: formatOrderTime(result.server_time, locale),
              })
            : undefined
        }
      />
      <QueueTransitionProvider>
        <Container className="rounded-card divide-ui-border-base divide-y overflow-hidden p-0">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
            <QueueViews
              current={view}
              locale={locale}
              awaitingCount={
                view === "awaiting" && result && !isFiltered
                  ? result.count
                  : undefined
              }
            />
            <OrderFilters
              key={view}
              query={query}
              locale={locale}
              isRangeInvalid={isRangeInvalid}
            />
          </div>
          <QueueResults>
            {isRangeInvalid ? null : !result ? (
              <div
                role="alert"
                className="flex flex-col gap-2 px-4 py-6 sm:px-6"
              >
                <Heading level="h2">{text.unavailable}</Heading>
                <Text className="text-ui-fg-subtle">{text.retry_hint}</Text>
                <Link
                  href={queueHref(query, { page })}
                  className={clx(LINK_BUTTON, "mt-2 self-start")}
                >
                  {text.retry}
                </Link>
              </div>
            ) : result.orders.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-4 py-8 sm:px-6">
                <Text className="text-ui-fg-subtle">
                  {isFiltered ? text.empty_filtered : text[EMPTY[view]]}
                </Text>
                {isFiltered && (
                  <Link href={clearHref} className={LINK_BUTTON}>
                    {text.clear_filters}
                  </Link>
                )}
              </div>
            ) : (
              <ul className="divide-ui-border-base divide-y">
                {result.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    view={view}
                    locale={locale}
                    serverTime={result.server_time}
                  />
                ))}
              </ul>
            )}
          </QueueResults>
          {result && result.count > 0 && (
            <nav
              aria-label={text.pages}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
            >
              <Text size="small" className="text-ui-fg-subtle tabular-nums">
                {formatText(text.showing, {
                  from: (page - 1) * ORDERS_PAGE_SIZE + 1,
                  to: Math.min(page * ORDERS_PAGE_SIZE, result.count),
                  count: result.count,
                })}
              </Text>
              {pages > 1 && (
                <div className="flex flex-wrap items-center gap-3">
                  <Text size="small" className="text-ui-fg-subtle tabular-nums">
                    {formatText(text.page_of, { page, pages })}
                  </Text>
                  {page > 1 && (
                    <Link
                      href={queueHref(query, { page: page - 1 })}
                      className={LINK_BUTTON}
                    >
                      {text.previous}
                    </Link>
                  )}
                  {page < pages && (
                    <Link
                      href={queueHref(query, { page: page + 1 })}
                      className={LINK_BUTTON}
                    >
                      {text.next}
                    </Link>
                  )}
                </div>
              )}
            </nav>
          )}
        </Container>
      </QueueTransitionProvider>
    </div>
  )
}
