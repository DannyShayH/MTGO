import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { ArrowLeftMini } from "@medusajs/icons"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getCompletedDeliveries,
  requireDeliveryAgent,
  signOutDeliveryAgent,
} from "@lib/data/delivery-agent"
import { BrandMark } from "@modules/layout/components/brand-mark"
import { DeliveryHeader } from "@modules/delivery/delivery-header"
import { CARD, PRESSABLE } from "@modules/delivery/copy"
import { CompletedRow } from "@modules/delivery/completed-delivery"
import { dateTimeFormatter } from "@modules/delivery/format"

const PAGE_SIZE = 20
const LINK = `text-mtogo-text-link focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center rounded-md px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`

/**
 * The agent's own completed deliveries (#161; spec #48 stories 62, 63),
 * newest first and paged by the server. Only reference, Restaurant, times
 * and outcome are shown: the Customer's contact and address end with the
 * delivery.
 */
export default async function DeliveryHistory({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  // Signed out goes to sign-in; ended access to its notice.
  const agent = await requireDeliveryAgent()
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const rawPage = Number((await searchParams).page ?? "1")
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const history = await getCompletedDeliveries(
    (page - 1) * PAGE_SIZE,
    PAGE_SIZE,
  ).catch((error) => {
    unstable_rethrow(error)
    return null
  })
  const formatDateTime = dateTimeFormatter(locale)
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
      <DeliveryHeader
        brand={<BrandMark name={copy.title} />}
        agentName={agent.agent.name}
        copy={copy}
        signOut={signOutDeliveryAgent}
      />
      <Link href="/delivery" className={`${LINK} -ml-1 gap-1 self-start`}>
        <ArrowLeftMini aria-hidden />
        {copy.back}
      </Link>
      <h1 className="text-mtogo-text-primary text-2xl font-semibold leading-tight tracking-tight">
        {copy.history}
      </h1>
      <p className="text-mtogo-text-secondary text-sm">{copy.historyPrivacy}</p>
      {!history ? (
        message(copy.historyFailed, true)
      ) : history.deliveries.length ? (
        <ul className="flex flex-col gap-3">
          {history.deliveries.map((delivery) => (
            <li key={delivery.id}>
              <CompletedRow
                delivery={delivery}
                copy={copy}
                formatDateTime={formatDateTime}
              />
            </li>
          ))}
        </ul>
      ) : (
        message(copy.historyEmpty)
      )}
      {history && (page > 1 || history.has_more) && (
        <nav className="flex justify-between gap-4" aria-label={copy.history}>
          {page > 1 && (
            <Link href={`/delivery/history?page=${page - 1}`} className={LINK}>
              {copy.previous}
            </Link>
          )}
          {history.has_more && (
            <Link
              href={`/delivery/history?page=${page + 1}`}
              className={`${LINK} ml-auto`}
            >
              {copy.next}
            </Link>
          )}
        </nav>
      )}
    </main>
  )
}
