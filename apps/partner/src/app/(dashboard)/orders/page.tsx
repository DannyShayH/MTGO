import Link from "next/link"
import { formatOrderTime, formatText, ORDER_TEXT } from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import {
  listOrders,
  ORDER_VIEWS,
  ORDERS_PAGE_SIZE,
  type OrderView,
} from "@lib/data/orders"
import { OrderCard } from "@modules/orders/components/order-card"
import { QueueViews } from "@modules/orders/components/queue-views"
import { LiveOrders } from "@modules/orders/components/live-orders"

const LINK_CLASS =
  "focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center rounded border border-mtogo-border-control px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"

const EMPTY = {
  awaiting: "empty_awaiting",
  active: "empty_active",
  history: "empty_history",
} as const

const isView = (value: unknown): value is OrderView =>
  ORDER_VIEWS.includes(value as OrderView)

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>
}) {
  await requireCurrentStaff()
  const { locale } = await getMessages()
  const text = ORDER_TEXT[locale]
  const params = await searchParams
  const view = isView(params.view) ? params.view : "awaiting"
  const page = Math.max(1, Math.floor(Number(params.page)) || 1)
  const result = await listOrders(view, (page - 1) * ORDERS_PAGE_SIZE)
  const here = `/orders?view=${view}${page > 1 ? `&page=${page}` : ""}`
  const pages = result
    ? Math.max(1, Math.ceil(result.count / ORDERS_PAGE_SIZE))
    : 1
  const pageHref = (target: number) =>
    `/orders?view=${view}${target > 1 ? `&page=${target}` : ""}`

  return (
    // One column at every width, so the toolbar stays next to the queue it
    // controls and the deadline order reads the same everywhere.
    <div className="flex max-w-3xl flex-col gap-5">
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
      <QueueViews
        current={view}
        locale={locale}
        awaitingCount={view === "awaiting" && result ? result.count : undefined}
      />
      {!result ? (
        <Container className="rounded-card" role="alert">
          <Heading level="h2">{text.unavailable}</Heading>
          <Text className="text-ui-fg-subtle mt-2">{text.retry_hint}</Text>
          <Link href={here} className={`${LINK_CLASS} mt-4`}>
            {text.retry}
          </Link>
        </Container>
      ) : result.orders.length === 0 ? (
        <Container className="rounded-card">
          <Text className="text-ui-fg-subtle">{text[EMPTY[view]]}</Text>
        </Container>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {result.orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                view={view}
                locale={locale}
              />
            ))}
          </ul>
          {pages > 1 && (
            <nav
              aria-label={text.pages}
              className="flex flex-wrap items-center gap-3"
            >
              {page > 1 && (
                <Link href={pageHref(page - 1)} className={LINK_CLASS}>
                  {text.previous}
                </Link>
              )}
              <Text size="small" className="text-ui-fg-subtle tabular-nums">
                {formatText(text.page_of, { page, pages })}
                <span aria-hidden> · </span>
                {formatText(text.showing, {
                  from: (page - 1) * ORDERS_PAGE_SIZE + 1,
                  to: Math.min(page * ORDERS_PAGE_SIZE, result.count),
                  count: result.count,
                })}
              </Text>
              {page < pages && (
                <Link href={pageHref(page + 1)} className={LINK_CLASS}>
                  {text.next}
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
