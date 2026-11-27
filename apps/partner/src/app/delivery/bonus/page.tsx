import Link from "next/link"
import { notFound, unstable_rethrow } from "next/navigation"
import { DELIVERY_AGENT_TEXT, formatExactDkk, formatText } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"
import {
  getAgentBonus,
  requireDeliveryAgent,
  signOutDeliveryAgent,
} from "@lib/data/delivery-agent"
import { BrandMark } from "@modules/common/components/brand-mark"
import { DeliveryHeader } from "@modules/delivery/delivery-header"
import { CARD } from "@modules/delivery/copy"
import { dateTimeFormatter } from "@modules/delivery/format"

export default async function BonusPage() {
  const agent = await requireDeliveryAgent()
  const { locale } = await getMessages()
  const copy = DELIVERY_AGENT_TEXT[locale]
  const bonus = await getAgentBonus().catch((error) => {
    unstable_rethrow(error)
    return undefined
  })
  if (bonus === null) notFound()
  const date = dateTimeFormatter(locale)
  const dkk = (amount: string) => formatExactDkk(amount, locale)
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6">
      <DeliveryHeader
        brand={<BrandMark name={copy.title} />}
        agentName={agent.agent.name}
        copy={copy}
        signOut={signOutDeliveryAgent}
      />
      <Link
        href="/delivery"
        className="text-mtogo-text-link focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2"
      >
        {copy.back}
      </Link>
      <h1 className="text-mtogo-text-primary text-2xl font-semibold">
        {copy.bonus}
      </h1>
      {bonus === undefined ? (
        <p role="alert">{copy.bonusFailed}</p>
      ) : (
        <>
          <p className="text-mtogo-text-secondary">
            {copy.bonusProvisional} · {bonus.month}
          </p>
          {bonus.estimate ? (
            <section className={`${CARD} flex flex-col gap-1 break-words p-4`}>
              <p className="text-mtogo-text-primary text-xl font-semibold">
                {formatText(copy.bonusSoFar, {
                  amount: dkk(bonus.estimate.amount),
                })}
              </p>
              <p className="text-mtogo-text-secondary">
                {formatText(copy.bonusDeliveryCount, {
                  count: bonus.estimate.delivery_count,
                })}
              </p>
            </section>
          ) : (
            <p className={`${CARD} break-words p-4 font-semibold`}>
              {bonus.pool === "none" ? copy.bonusNoPool : copy.bonusNoPoints}
            </p>
          )}
          <p className="text-mtogo-text-secondary text-sm">
            {copy.bonusCalculated}: {date(bonus.calculated_at)}
          </p>
          {bonus.deliveries.length === 0 ? (
            <p>{copy.bonusEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bonus.deliveries.map((delivery) => (
                <li
                  key={delivery.id}
                  className={`${CARD} flex flex-col gap-2 break-words p-4`}
                >
                  <h2 className="font-semibold">#{delivery.order_reference}</h2>
                  <p>{date(delivery.handover_at)}</p>
                  {delivery.picked_up_at && (
                    <p>
                      {copy.bonusPickup}: {date(delivery.picked_up_at)}
                    </p>
                  )}
                  {delivery.calculation ? (
                    <>
                      <p>
                        {copy.bonusFood}: {delivery.calculation.food_value} DKK
                      </p>
                      <p>
                        {delivery.calculation.time_bonus
                          ? copy.bonusTimeYes
                          : copy.bonusTimeNo}
                      </p>
                      <p>
                        {delivery.calculation.rating_bonus
                          ? copy.bonusRatingYes
                          : copy.bonusRatingNo}
                      </p>
                      <p className="font-semibold">
                        {delivery.calculation.points} {copy.bonusPoints}
                      </p>
                      {delivery.amount !== null && (
                        <p>
                          {formatText(copy.bonusDeliveryAmount, {
                            amount: dkk(delivery.amount),
                          })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p>{copy.bonusUnavailable}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
