import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { ArrowLeftMini } from "@medusajs/icons"
import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getCompletedDelivery,
  requireDeliveryAgent,
} from "@lib/data/delivery-agent"
import { CARD, PRESSABLE } from "@modules/delivery/copy"
import { CompletedDetail } from "@modules/delivery/completed-delivery"
import { dateTimeFormatter } from "@modules/delivery/format"

/**
 * One of the agent's own completed deliveries (#161). Another agent's,
 * still active or unknown work reads alike as not in the history, so the
 * page reveals nothing about it.
 */
export default async function CompletedDeliveryPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  // Signed out goes to sign-in; ended access to its notice.
  await requireDeliveryAgent()
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const delivery = await getCompletedDelivery((await params).orderId).catch(
    (error) => {
      unstable_rethrow(error)
      return undefined
    },
  )
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link
        href="/delivery/history"
        className={`text-mtogo-text-link focus-visible:ring-mtogo-focus-ring -ml-1 flex min-h-11 items-center gap-1 self-start rounded-md px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`}
      >
        <ArrowLeftMini aria-hidden />
        {copy.backToHistory}
      </Link>
      {delivery ? (
        <CompletedDetail
          delivery={delivery}
          copy={copy}
          formatDateTime={dateTimeFormatter(locale)}
        />
      ) : (
        <p
          role={delivery === undefined ? "alert" : undefined}
          className={`${CARD} text-mtogo-text-secondary p-4 text-base`}
        >
          {delivery === undefined
            ? copy.historyFailed
            : copy.historyUnavailable}
        </p>
      )}
    </main>
  )
}
