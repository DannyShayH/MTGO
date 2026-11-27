import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"
import { unstable_rethrow } from "next/navigation"
import Link from "next/link"
import {
  ArrowPath,
  CheckCircleSolid,
  ExclamationCircleSolid,
} from "@medusajs/icons"
import { DELIVERY_AGENT_TEXT, formatText } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  requireDeliveryAgent,
  getDeliveryFilter,
  getAvailableDeliveries,
  getCompletedDeliveries,
  getCompletedDelivery,
  getCurrentDelivery,
  signOutDeliveryAgent,
} from "@lib/data/delivery-agent"
import { LanguageSwitch } from "@modules/common/components/language-switch"
import { AreaFilter } from "@modules/delivery/area-filter"
import { AvailableCard } from "@modules/delivery/available-card"
import {
  CARD,
  CLAIM_HINT_ID,
  PRESSABLE,
  SHARE_CHOICE_COOKIE,
} from "@modules/delivery/copy"
import { CurrentDeliveryCard } from "@modules/delivery/current-delivery"
import { recentlyCancelled } from "@modules/delivery/cancelled-notice"
import { BrandMark } from "@modules/common/components/brand-mark"
import { DeliveryHeader } from "@modules/delivery/delivery-header"
import { DeliveryFeed } from "@modules/delivery/delivery-feed"
import {
  AvailableList,
  LocationSharing,
  LocationSwitch,
  SortControl,
} from "@modules/delivery/location-sharing"

const SECTION_TITLE =
  "text-mtogo-text-primary text-lg font-semibold tracking-tight"

/**
 * The Delivery agent workspace on a phone (#156, #157): the current
 * delivery first, then the available work in the chosen towns. One column at
 * every width, so the order never changes. Right after a handover (#161) it
 * shows the completion, read back from the agent's own history, above the
 * now empty current section, so the agent can claim the next job.
 */
export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; completed?: string }>
}) {
  const agent = await requireDeliveryAgent()
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  // From the session, so the hidden Bonus route is not asked on every render (#252).
  const hasBonus = agent.features?.agent_bonus === true
  const selected = await getDeliveryFilter(agent.agent.id, agent.postal_codes)
  const params = await searchParams
  const rawPage = Number(params.page ?? "1")
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  // `undefined` is a failed read: claims stay hidden rather than guessed.
  const current = await getCurrentDelivery().catch((error) => {
    // A signed-out or revoked agent is redirected, not shown an error.
    unstable_rethrow(error)
    return undefined
  })
  // Only the agent's own completed work is shown; anything else shows nothing.
  const completed =
    typeof params.completed === "string" && params.completed
      ? await getCompletedDelivery(params.completed).catch((error) => {
          unstable_rethrow(error)
          return null
        })
      : null
  // Work an operator cancelled under the agent (#199) leaves the current
  // section; the newest ended delivery, when it was cancelled recently, says
  // why, so the agent stops travelling.
  const cancelled =
    current === null && !completed
      ? await getCompletedDeliveries(0, 1)
          .then(({ deliveries }) => deliveries[0] ?? null)
          .catch((error) => {
            unstable_rethrow(error)
            return null
          })
      : null
  const cancelledNotice = recentlyCancelled(cancelled, new Date())
  const deliveries = await getAvailableDeliveries(
    selected,
    (page - 1) * 20,
  ).catch(() => null)
  const towns = new Map(
    agent.areas.map(({ postal_code, name }) => [postal_code, name]),
  )
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
      timeZone: "Europe/Copenhagen",
      timeStyle: "short",
    }).format(new Date(value))
  // Pickups the agent may measure their distance to (#191): the listed work
  // and the current delivery until its food is collected.
  const measured = [
    ...(current && !current.picked_up_at ? [current.order_id] : []),
    ...(deliveries?.deliveries.map(({ order_id }) => order_id) ?? []),
  ]
  // Credit the provider wherever its distances can show: trip distances,
  // or pickup distances once the agent shares their location.
  const hasDistances =
    measured.length > 0 ||
    (current?.trip_distance_km ?? null) !== null ||
    !!deliveries?.deliveries.some(
      ({ trip_distance_km }) => trip_distance_km !== null,
    )
  const message = (text: string, alert = false) => (
    <p
      role={alert ? "alert" : undefined}
      className={`${CARD} text-mtogo-text-secondary p-4 text-base`}
    >
      {text}
    </p>
  )
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-8 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <DeliveryHeader
        brand={<BrandMark name={copy.title} />}
        agentName={agent.agent.name}
        copy={copy}
        signOut={signOutDeliveryAgent}
      />
      <h1 className="text-mtogo-text-primary -mt-4 break-words text-2xl font-semibold leading-tight tracking-tight">
        {agent.agent.name}
      </h1>

      <LocationSharing
        orderIds={measured}
        // Collected, active work is shared with its Customer (#166).
        transitOrderId={current?.picked_up_at ? current.order_id : null}
        remembered={(await cookies()).get(SHARE_CHOICE_COOKIE)?.value === "on"}
      >
        {hasBonus && (
          <Link
            prefetch={false}
            href="/delivery/bonus"
            className="text-mtogo-text-link focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
          >
            {copy.bonus}
          </Link>
        )}
        <DeliveryFeed copy={copy} />
        <LocationSwitch copy={copy} locale={locale} />
        <section
          id="current"
          className="flex scroll-mt-4 flex-col gap-3"
          aria-labelledby="current-title"
        >
          <h2 id="current-title" className={SECTION_TITLE}>
            {copy.current}
          </h2>
          {completed?.outcome === "delivered" && (
            <div
              role="status"
              className="bg-mtogo-status-success-surface text-mtogo-status-success-text flex items-start gap-2 rounded-lg p-4 text-base"
            >
              <CheckCircleSolid aria-hidden className="mt-0.5 shrink-0" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{copy.completedTitle}</span>
                <span className="break-words">
                  {completed.restaurant_name}{" "}
                  <span className="tabular-nums">
                    #{completed.order_reference}
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatText(copy.completedAt, {
                    time: formatTime(completed.ended_at),
                  })}
                </span>
                {!current && <span>{copy.completedNext}</span>}
              </span>
            </div>
          )}
          {cancelledNotice && (
            <div
              role="status"
              className="bg-mtogo-status-warning-surface text-mtogo-status-warning-text flex items-start gap-2 rounded-lg p-4 text-base"
            >
              <ExclamationCircleSolid aria-hidden className="mt-0.5 shrink-0" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{copy.cancelledTitle}</span>
                <span className="break-words">
                  {cancelledNotice.restaurant_name}{" "}
                  <span className="tabular-nums">
                    #{cancelledNotice.order_reference}
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatText(copy.cancelledAt, {
                    time: formatTime(cancelledNotice.ended_at),
                  })}
                </span>
                <span>{copy.completedNext}</span>
              </span>
            </div>
          )}
          {current === undefined ? (
            message(copy.currentFailed, true)
          ) : current ? (
            <CurrentDeliveryCard
              delivery={current}
              copy={copy}
              locale={locale}
              actionRetryIdentity={randomUUID()}
              formatTime={formatTime}
            />
          ) : (
            message(copy.noCurrent)
          )}
          <Link
            prefetch={false}
            href="/delivery/history"
            className={`text-mtogo-text-link focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center self-start rounded-md px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`}
          >
            {copy.historyLink}
          </Link>
        </section>

        <section
          className="flex flex-col gap-3"
          aria-labelledby="available-title"
        >
          {/* Refresh wraps below the title at high zoom instead of leaving the screen. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id="available-title" className={`${SECTION_TITLE} min-w-0`}>
              {copy.available}
              {deliveries && deliveries.deliveries.length > 0 && (
                <span className="text-mtogo-text-secondary ml-2 text-base font-normal tabular-nums">
                  {formatText(copy.availableCount, {
                    count: `${deliveries.deliveries.length}${deliveries.has_more ? "+" : ""}`,
                  })}
                </span>
              )}
            </h2>
            <a
              href={`/delivery?page=${page}`}
              className={`text-mtogo-text-link focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`}
            >
              <ArrowPath aria-hidden />
              {copy.refresh}
            </a>
          </div>
          <AreaFilter areas={agent.areas} selected={selected} copy={copy} />
          <SortControl copy={copy} />
          {deliveries?.deliveries.length ? (
            current === null ? (
              <p
                id={CLAIM_HINT_ID}
                className="text-mtogo-text-secondary text-sm"
              >
                {copy.claimHint}
              </p>
            ) : current ? (
              <p className="text-mtogo-text-secondary text-sm">{copy.busy}</p>
            ) : null
          ) : null}
          {!deliveries ? (
            message(copy.loadFailed, true)
          ) : deliveries.deliveries.length ? (
            <AvailableList
              items={deliveries.deliveries.map((item) => ({
                order_id: item.order_id,
                node: (
                  <AvailableCard
                    delivery={item}
                    town={towns.get(item.destination_postal_code) ?? null}
                    serverTime={deliveries.server_time}
                    copy={copy}
                    locale={locale}
                    formatTime={formatTime}
                    retryIdentity={current === null ? randomUUID() : undefined}
                  />
                ),
              }))}
            />
          ) : (
            message(copy.empty)
          )}
          {deliveries && (page > 1 || deliveries.has_more) && (
            <nav
              className="flex justify-between gap-4"
              aria-label={copy.available}
            >
              {page > 1 && (
                <a
                  href={`/delivery?page=${page - 1}`}
                  className="text-mtogo-text-link flex min-h-11 items-center text-sm font-medium"
                >
                  {copy.previous}
                </a>
              )}
              {deliveries.has_more && (
                <a
                  href={`/delivery?page=${page + 1}`}
                  className="text-mtogo-text-link ml-auto flex min-h-11 items-center text-sm font-medium"
                >
                  {copy.next}
                </a>
              )}
            </nav>
          )}
        </section>
      </LocationSharing>

      <footer className="mt-auto flex flex-col items-center gap-3 pt-4">
        {hasDistances && (
          <p className="text-mtogo-text-secondary text-center text-xs">
            {copy.distanceAttribution}
          </p>
        )}
        <LanguageSwitch locale={locale} label={copy.language} />
      </footer>
    </main>
  )
}
