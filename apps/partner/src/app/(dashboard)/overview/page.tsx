import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { OverviewTemplate } from "@modules/overview/templates/overview-template"

export default async function OverviewPage() {
  // Pages render independently of the layout, so each one checks the session.
  const current = await requireCurrentStaff()
  const { messages } = await getMessages()
  return (
    <OverviewTemplate
      text={messages.text}
      restaurantName={current.restaurant.name}
    />
  )
}
