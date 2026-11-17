import { getCustomerLocale } from "@lib/data/customer-locale"
import { listOrderPage } from "@lib/data/orders"
import { accountText } from "@lib/util/account-text"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import OrderRow from "@modules/account/components/order-row"

const pageSize = 10

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const locale = await getCustomerLocale()
  const text = accountText[locale]
  const params = await searchParams
  const allowedStatuses = [
    "pending",
    "completed",
    "canceled",
    "archived",
    "requires_action",
  ] as const
  const status = allowedStatuses.find((value) => value === params.status) ?? ""
  const labels = {
    pending: text.pending,
    completed: text.completedStatus,
    canceled: text.canceled,
    archived: text.archived,
    requires_action: text.requiresAction,
  }
  const historyHref = (pageNumber: number) =>
    `/account/orders?${new URLSearchParams({ page: String(pageNumber), ...(status ? { status } : {}) })}`
  const raw = Number(params.page ?? 1)
  const page = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 100000) : 1
  const result = await listOrderPage(
    pageSize,
    (page - 1) * pageSize,
    status || undefined,
  ).catch(() => null)
  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 space-y-3">
        <h1 className="text-2xl-semi">{text.orders}</h1>
        <p>{text.ordersDescription}</p>
      </div>
      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-page p-4"
      >
        <label
          className="grid min-w-0 flex-1 basis-full gap-2 text-sm font-medium sm:basis-auto"
          htmlFor="order-status-filter"
        >
          {text.status}
          <select
            id="order-status-filter"
            name="status"
            defaultValue={status}
            className="h-11 w-full min-w-0 rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring"
          >
            <option value="">{text.allOrders}</option>
            {allowedStatuses.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md bg-mtogo-text-link px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
        >
          {text.applyFilters}
        </button>
        {status && (
          <LocalizedClientLink
            href="/account/orders"
            className="inline-flex min-h-11 items-center text-sm font-medium text-mtogo-text-link underline"
          >
            {text.resetFilters}
          </LocalizedClientLink>
        )}
      </form>
      {!result ? (
        <div role="alert" className="space-y-4">
          <p>{text.failed}</p>
          <LocalizedClientLink
            className="text-mtogo-text-link underline"
            href={historyHref(page)}
          >
            {text.retry}
          </LocalizedClientLink>
        </div>
      ) : result.orders.length === 0 ? (
        <div className="space-y-4" data-testid="no-orders-container">
          <p>{status ? text.noMatches : text.empty}</p>
          <LocalizedClientLink
            className="text-mtogo-text-link underline"
            href="/"
          >
            {text.browse}
          </LocalizedClientLink>
          {page > 1 && (
            <p>
              <LocalizedClientLink
                className="underline"
                href={historyHref(page - 1)}
              >
                {text.previous}
              </LocalizedClientLink>
            </p>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {result.orders.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} locale={locale} />
              </li>
            ))}
          </ul>
          <nav
            aria-label={text.orders}
            className="mt-6 flex items-center justify-between gap-4"
          >
            {page > 1 ? (
              <LocalizedClientLink
                className="min-h-11 inline-flex items-center underline"
                href={historyHref(page - 1)}
              >
                {text.previous}
              </LocalizedClientLink>
            ) : (
              <span />
            )}
            <span>
              {text.page} {page} /{" "}
              {Math.max(1, Math.ceil(result.count / pageSize))}
            </span>
            {page * pageSize < result.count ? (
              <LocalizedClientLink
                className="min-h-11 inline-flex items-center underline"
                href={historyHref(page + 1)}
              >
                {text.next}
              </LocalizedClientLink>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </div>
  )
}
