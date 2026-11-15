import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveOwnRestaurant } from "@lib/data/restaurant"
import { OverviewTemplate } from "@modules/overview/templates/overview-template"
import { PhotoUpload } from "@modules/menu/components/photo-upload"

export default async function OverviewPage() {
  // Pages render independently of the layout, so each one checks the session.
  const current = await requireCurrentStaff()
  const restaurant = await retrieveOwnRestaurant(current.restaurant.id)
  const { messages, locale } = await getMessages()
  return (
    <>
      <OverviewTemplate messages={messages} restaurant={restaurant} />
      <div className="mt-6">
        <PhotoUpload
          kind="cover"
          resourceId={restaurant.id}
          revision={restaurant.cover_revision}
          locale={locale}
          initialUrl={restaurant.cover?.url}
        />
      </div>
    </>
  )
}
