import { getCustomerLocale } from "@lib/data/customer-locale"
import { listOrderPage } from "@lib/data/orders"
import { accountText } from "@lib/util/account-text"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"

const pageSize = 10

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const locale = await getCustomerLocale()
  const text = accountText[locale]
  const raw = Number((await searchParams).page ?? 1)
  const page = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 100000) : 1
  const result = await listOrderPage(pageSize, (page - 1) * pageSize).catch(
    () => null,
  )
  const statusLabels: Record<string, string> = {
    pending: text.pending,
    completed: text.completedStatus,
    canceled: text.canceled,
    archived: text.archived,
    requires_action: text.requiresAction,
  }
  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 space-y-3">
        <h1 className="text-2xl-semi">{text.orders}</h1>
        <p>{text.ordersDescription}</p>
      </div>
      {!result ? (
        <div role="alert" className="space-y-4">
          <p>{text.failed}</p>
          <LocalizedClientLink
            className="text-mtogo-text-link underline"
            href={`/account/orders?page=${page}`}
          >
            {text.retry}
          </LocalizedClientLink>
        </div>
      ) : result.orders.length === 0 ? (
        <div className="space-y-4" data-testid="no-orders-container">
          <p>{text.empty}</p>
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
                href={`/account/orders?page=${page - 1}`}
              >
                {text.previous}
              </LocalizedClientLink>
            </p>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-mtogo-border-subtle border-y border-mtogo-border-subtle">
            {result.orders.map((order) => {
              const restaurant =
                typeof order.metadata?.restaurant_name === "string"
                  ? order.metadata.restaurant_name
                  : text.unknownRestaurant
              return (
                <li key={order.id} className="py-5">
                  <LocalizedClientLink
                    className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
                    href={`/account/orders/details/${order.id}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">
                        #{order.display_id} · {restaurant}
                      </span>
                      <span className="font-semibold">
                        {convertToLocale({
                          amount: order.total,
                          currency_code: order.currency_code,
                          locale: locale === "da" ? "da-DK" : "en-GB",
                        })}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-small-regular text-ui-fg-subtle">
                      <span>
                        {new Date(order.created_at).toLocaleDateString(
                          locale === "da" ? "da-DK" : "en-GB",
                        )}{" "}
                        · {statusLabels[order.status] ?? order.status}
                      </span>
                      <span className="text-mtogo-text-link underline">
                        {text.details}
                      </span>
                    </div>
                  </LocalizedClientLink>
                </li>
              )
            })}
          </ul>
          <nav
            aria-label={text.orders}
            className="mt-6 flex items-center justify-between gap-4"
          >
            {page > 1 ? (
              <LocalizedClientLink
                className="min-h-11 inline-flex items-center underline"
                href={`/account/orders?page=${page - 1}`}
              >
                {text.previous}
              </LocalizedClientLink>
            ) : (
              <span />
            )}
            <span>
              {text.page} {page}
            </span>
            {page * pageSize < result.count ? (
              <LocalizedClientLink
                className="min-h-11 inline-flex items-center underline"
                href={`/account/orders?page=${page + 1}`}
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
