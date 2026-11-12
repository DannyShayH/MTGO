import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveOwnRestaurant } from "@lib/data/restaurant"
import { OverviewTemplate } from "@modules/overview/templates/overview-template"

export default async function OverviewPage() {
  // Pages render independently of the layout, so each one checks the session.
  const current = await requireCurrentStaff()
  const restaurant = await retrieveOwnRestaurant(current.restaurant.id)
  const { messages } = await getMessages()
  return <OverviewTemplate text={messages.text} restaurant={restaurant} />
}
