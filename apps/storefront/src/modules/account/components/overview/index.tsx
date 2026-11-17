import { ArrowRight, ShoppingBag } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { Locale } from "@dtc/i18n"
import { accountText } from "@lib/util/account-text"
import OrderRow from "../order-row"

import { HttpTypes } from "@medusajs/types"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  locale: Locale
  orders: HttpTypes.StoreOrder[] | null
}

const Overview = ({ customer, orders, locale }: OverviewProps) => {
  const text = accountText[locale]
  return (
    <div data-testid="overview-page-wrapper">
      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 text-2xl font-semibold">
          <span data-testid="welcome-message" data-value={customer?.first_name}>
            {text.hello} {customer?.first_name}
          </span>
          <span className="text-sm font-normal text-mtogo-text-secondary [overflow-wrap:anywhere]">
            {text.signedIn}:{" "}
            <span
              className="font-semibold"
              data-testid="customer-email"
              data-value={customer?.email}
            >
              {customer?.email}
            </span>
          </span>
        </div>
        <div className="flex flex-col py-8 border-t border-gray-200">
          <div className="flex flex-col gap-y-4 h-full col-span-1 row-span-2 flex-1">
            <div className="mb-8 grid grid-cols-2 gap-4">
              <div className="flex min-w-0 flex-col gap-y-4">
                <h3 className="text-large-semi">{text.profile}</h3>
                <div className="flex items-end gap-x-2">
                  <span
                    className="text-3xl-semi leading-none"
                    data-testid="customer-profile-completion"
                    data-value={getProfileCompletion(customer)}
                  >
                    {getProfileCompletion(customer)}%
                  </span>
                  <span className="uppercase text-base-regular text-ui-fg-subtle">
                    {text.completed}
                  </span>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-y-4">
                <h3 className="text-large-semi">{text.addresses}</h3>
                <div className="flex items-end gap-x-2">
                  <span
                    className="text-3xl-semi leading-none"
                    data-testid="addresses-count"
                    data-value={customer?.addresses?.length || 0}
                  >
                    {customer?.addresses?.length || 0}
                  </span>
                  <span className="uppercase text-base-regular text-ui-fg-subtle">
                    {text.saved}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-large-semi">{text.recent}</h3>
                <LocalizedClientLink
                  href="/account/orders"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-4 text-sm font-semibold text-mtogo-text-link transition-colors hover:bg-mtogo-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
                >
                  <ShoppingBag aria-hidden="true" />
                  {text.viewAllOrders}
                  <ArrowRight aria-hidden="true" />
                </LocalizedClientLink>
              </div>
              <ul
                className="flex flex-col gap-y-4"
                data-testid="orders-wrapper"
              >
                {orders && orders.length > 0 ? (
                  orders.slice(0, 5).map((order) => {
                    return (
                      <li
                        key={order.id}
                        data-testid="order-wrapper"
                        data-value={order.id}
                      >
                        <OrderRow order={order} locale={locale} />
                      </li>
                    )
                  })
                ) : (
                  <span data-testid="no-orders-message">
                    {orders === null ? text.failed : text.noRecent}
                  </span>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const getProfileCompletion = (customer: HttpTypes.StoreCustomer | null) => {
  let count = 0

  if (!customer) {
    return 0
  }

  if (customer.email) {
    count++
  }

  if (customer.first_name && customer.last_name) {
    count++
  }

  if (customer.phone) {
    count++
  }

  const billingAddress = customer.addresses?.find(
    (addr) => addr.is_default_billing,
  )

  if (billingAddress) {
    count++
  }

  return (count / 4) * 100
}

export default Overview
