import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { Sidebar } from "@modules/layout/components/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const current = await requireCurrentStaff()
  const { locale, messages } = await getMessages()
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        locale={locale}
        text={messages.text}
        staffName={current.staff.name}
        restaurantName={current.restaurant.name}
      />
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>
    </div>
  )
}
