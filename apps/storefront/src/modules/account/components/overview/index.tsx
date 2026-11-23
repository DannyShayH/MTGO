import {
  ArrowRight,
  CheckCircleSolid,
  Plus,
  ShoppingBag,
} from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { Locale } from "@dtc/i18n"
import { accountText } from "@lib/util/account-text"
import {
  profileChecklist,
  type ProfileItemKey,
} from "@lib/util/profile-checklist"
import OrderRow from "../order-row"

import { HttpTypes } from "@medusajs/types"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  locale: Locale
  orders: HttpTypes.StoreOrder[] | null
}

const Overview = ({ customer, orders, locale }: OverviewProps) => {
  const text = accountText[locale]
  const checklist = profileChecklist(customer)
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
                    data-value={checklist.percent}
                  >
                    {checklist.percent}%
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

            {!checklist.isComplete && (
              <ProfileChecklistCard checklist={checklist} locale={locale} />
            )}

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

const ITEM_LABELS: Record<
  ProfileItemKey,
  "checklistEmail" | "checklistName" | "checklistPhone" | "checklistAddress"
> = {
  email: "checklistEmail",
  name: "checklistName",
  phone: "checklistPhone",
  address: "checklistAddress",
}

/**
 * What is left to fill in, until nothing is: a progress bar, then one row
 * per part with a check once done or a link to the page that fills it in.
 * It disappears at 100%, so a finished profile is not nagged. Static on
 * load, since the overview is opened often (design brief, Motion).
 */
function ProfileChecklistCard({
  checklist,
  locale,
}: {
  checklist: ReturnType<typeof profileChecklist>
  locale: Locale
}) {
  const text = accountText[locale]
  const total = checklist.items.length
  return (
    <section
      aria-labelledby="profile-checklist-title"
      className="mb-8 rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-5"
      data-testid="profile-checklist"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="profile-checklist-title" className="text-large-semi">
          {text.checklistTitle}
        </h3>
        <span className="text-sm text-mtogo-text-secondary tabular-nums">
          {text.checklistProgress
            .replace("{done}", String(checklist.done))
            .replace("{total}", String(total))}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="profile-checklist-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={checklist.percent}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-mtogo-surface-selected"
      >
        <div
          className="h-full origin-left rounded-full bg-mtogo-action-primary"
          style={{ transform: `scaleX(${checklist.percent / 100})` }}
        />
      </div>
      <p className="mt-3 max-w-prose text-sm text-mtogo-text-secondary">
        {text.checklistNote}
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-mtogo-border-subtle">
        {checklist.items.map(({ key, isDone, href }) => (
          <li
            key={key}
            className="flex min-h-12 items-center gap-3 py-1"
            data-testid={`profile-checklist-${key}`}
            data-done={isDone}
          >
            {isDone ? (
              <CheckCircleSolid
                aria-hidden="true"
                className="shrink-0 text-mtogo-status-success-text"
              />
            ) : (
              <span
                aria-hidden="true"
                className="ml-0.5 size-4 shrink-0 rounded-full border-2 border-mtogo-border-control"
              />
            )}
            <span
              className={
                isDone
                  ? "flex-1 text-mtogo-text-secondary"
                  : "flex-1 font-medium text-mtogo-text-primary"
              }
            >
              {text[ITEM_LABELS[key]]}
              {isDone && (
                <span className="sr-only">{`, ${text.checklistDone}`}</span>
              )}
            </span>
            {!isDone && (
              <LocalizedClientLink
                href={href}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-mtogo-text-link transition-[background-color,transform] duration-150 ease-out-strong hover:bg-mtogo-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 motion-safe:active:scale-[0.97]"
              >
                <Plus aria-hidden="true" />
                {text.checklistAdd}
                <span className="sr-only">{` ${text[ITEM_LABELS[key]].toLowerCase()}`}</span>
              </LocalizedClientLink>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Overview
