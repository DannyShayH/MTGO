import { DELIVERY_AGENT_TEXT } from "@dtc/i18n"
import { getMessages } from "@lib/i18n"

export default async function BonusLoading() {
  const { locale } = await getMessages()
  return (
    <p role="status" className="mx-auto max-w-xl p-4">
      {DELIVERY_AGENT_TEXT[locale].bonusLoading}
    </p>
  )
}
