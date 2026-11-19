import { randomUUID } from "node:crypto"
import { redirect, unstable_rethrow } from "next/navigation"
import { ArrowPath } from "@medusajs/icons"
import { Button } from "@medusajs/ui"
import { DELIVERY_AGENT_TEXT, formatText } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getDeliveryAgent,
  getDeliveryFilter,
  getAvailableDeliveries,
  getCurrentDelivery,
  signOutDeliveryAgent,
} from "@lib/data/delivery-agent"
import { LanguageSwitch } from "@modules/layout/components/language-switch"
import { AreaFilter } from "@modules/delivery/area-filter"
import { AvailableCard } from "@modules/delivery/available-card"
import { CARD, CLAIM_HINT_ID, PRESSABLE } from "@modules/delivery/copy"
import { CurrentDeliveryCard } from "@modules/delivery/current-delivery"
import { ReconcileOnReturn } from "@modules/delivery/reconcile-on-return"

const SECTION_TITLE =
  "text-mtogo-text-primary text-lg font-semibold tracking-tight"

/**
 * The Delivery agent workspace on a phone (#156, #157): the current
 * delivery first, then the available work in the chosen towns. One column at
 * every width, so the order never changes.
 */
export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const agent = await getDeliveryAgent()
  if (!agent) redirect("/delivery-sign-in")
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const selected = await getDeliveryFilter(agent.agent.id, agent.postal_codes)
  const rawPage = Number((await searchParams).page ?? "1")
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  // `undefined` is a failed read: claims stay hidden rather than guessed.
  const current = await getCurrentDelivery().catch((error) => {
    // A signed-out or revoked agent is redirected, not shown an error.
    unstable_rethrow(error)
    return undefined
  })
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
      <ReconcileOnReturn />
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-mtogo-text-secondary text-sm">{copy.title}</p>
          <h1 className="text-mtogo-text-primary break-words text-2xl font-semibold leading-tight tracking-tight">
            {agent.agent.name}
          </h1>
        </div>
        <form action={signOutDeliveryAgent}>
          <Button
            variant="secondary"
            type="submit"
            className={`min-h-11 shrink-0 whitespace-nowrap ${PRESSABLE}`}
          >
            {copy.signOut}
          </Button>
        </form>
      </header>

      <section
        id="current"
        className="flex scroll-mt-4 flex-col gap-3"
        aria-labelledby="current-title"
      >
        <h2 id="current-title" className={SECTION_TITLE}>
          {copy.current}
        </h2>
        {current === undefined ? (
          message(copy.currentFailed, true)
        ) : current ? (
          <CurrentDeliveryCard
            delivery={current}
            copy={copy}
            locale={locale}
            pickupRetryIdentity={randomUUID()}
            formatTime={formatTime}
          />
        ) : (
          message(copy.noCurrent)
        )}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="available-title"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="available-title" className={SECTION_TITLE}>
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
        {deliveries?.deliveries.length ? (
          current === null ? (
            <p id={CLAIM_HINT_ID} className="text-mtogo-text-secondary text-sm">
              {copy.claimHint}
            </p>
          ) : current ? (
            <p className="text-mtogo-text-secondary text-sm">{copy.busy}</p>
          ) : null
        ) : null}
        {!deliveries ? (
          message(copy.loadFailed, true)
        ) : deliveries.deliveries.length ? (
          <ul className="flex flex-col gap-3">
            {deliveries.deliveries.map((item) => (
              <li key={item.id}>
                <AvailableCard
                  delivery={item}
                  town={towns.get(item.destination_postal_code) ?? null}
                  serverTime={deliveries.server_time}
                  copy={copy}
                  locale={locale}
                  formatTime={formatTime}
                  retryIdentity={current === null ? randomUUID() : undefined}
                />
              </li>
            ))}
          </ul>
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

      <footer className="mt-auto flex justify-center pt-4">
        <LanguageSwitch locale={locale} label={copy.language} />
      </footer>
    </main>
  )
}
