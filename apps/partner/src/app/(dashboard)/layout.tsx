import { cookies } from "next/headers"
import { Toaster } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { Sidebar } from "@modules/layout/components/sidebar"
import {
  ArrivalAlert,
  ArrivalAlertsProvider,
} from "@modules/orders/components/arrival-alerts"
import { KitchenFeedProvider } from "@modules/orders/components/kitchen-feed"
import { ARRIVAL_SOUND_COOKIE } from "@modules/orders/arrival-sound-state"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const current = await requireCurrentStaff()
  const { locale, messages } = await getMessages()
  const isSoundRemembered =
    (await cookies()).get(ARRIVAL_SOUND_COOKIE)?.value === "on"
  return (
    // The kitchen feed runs on every dashboard page, so the Orders badge,
    // the arrival banner and the sound reach staff wherever they are (#149).
    <ArrivalAlertsProvider isSoundRemembered={isSoundRemembered}>
      <KitchenFeedProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Toaster position="bottom-right" />
          <Sidebar
            locale={locale}
            text={messages.text}
            staffName={current.staff.name}
            restaurantName={current.restaurant.name}
            isStatementsReleased={!!current.features?.restaurant_statements}
            isOperationsReleased={!!current.features?.operations_monitoring}
          />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-10 xl:py-16">
            <div className="mx-auto w-full max-w-[90rem]">
              {/* From tablet width it stays in view while staff scroll, until
                  they hide it; on a phone it would cover too much. */}
              <div className="z-20 max-w-4xl md:sticky md:top-4">
                <ArrivalAlert locale={locale} />
              </div>
              {children}
            </div>
          </main>
        </div>
      </KitchenFeedProvider>
    </ArrivalAlertsProvider>
  )
}
