import { randomUUID } from "node:crypto"
import { ArrowLeftMini } from "@medusajs/icons"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getAvailableDelivery,
  getCurrentDelivery,
  requireDeliveryAgent,
} from "@lib/data/delivery-agent"
import { unstable_rethrow } from "next/navigation"
import Link from "next/link"
import { AvailableCard } from "@modules/delivery/available-card"
import { CARD, CLAIM_HINT_ID, PRESSABLE } from "@modules/delivery/copy"
import { ReconcileOnReturn } from "@modules/delivery/reconcile-on-return"

export default async function DeliveryDetail({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const agent = await requireDeliveryAgent()
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const result = await getAvailableDelivery((await params).orderId).catch(
    () => undefined,
  )
  const current = await getCurrentDelivery().catch((error) => {
    // A signed-out or revoked agent is redirected, not shown an error.
    unstable_rethrow(error)
    return undefined
  })
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
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <ReconcileOnReturn />
      <Link
        href="/delivery"
        className={`text-mtogo-text-link focus-visible:ring-mtogo-focus-ring -ml-1 flex min-h-11 items-center gap-1 self-start rounded-md px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`}
      >
        <ArrowLeftMini aria-hidden />
        {copy.back}
      </Link>
      {result === undefined ? (
        message(copy.loadFailed, true)
      ) : !result ? (
        message(copy.unavailable)
      ) : (
        <>
          <AvailableCard
            delivery={result.delivery}
            town={towns.get(result.delivery.destination_postal_code) ?? null}
            serverTime={result.server_time}
            copy={copy}
            locale={locale}
            formatTime={formatTime}
            retryIdentity={current === null ? randomUUID() : undefined}
            showDetails={false}
          />
          {current === null ? (
            <p id={CLAIM_HINT_ID} className="text-mtogo-text-secondary text-sm">
              {copy.claimHint}
            </p>
          ) : current ? (
            <p className="text-mtogo-text-secondary text-sm">{copy.busy}</p>
          ) : null}
        </>
      )}
    </main>
  )
}
