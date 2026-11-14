import { MENU_TEXT } from "@dtc/i18n"
import { Heading, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { dishRequest } from "@lib/data/menu-dishes"
import { Dishes } from "@modules/menu/components/dishes"

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const current = await requireCurrentStaff()
  const { locale } = await getMessages()
  const result = await dishRequest()
  const { saved } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Heading level="h1">{MENU_TEXT[locale].title}</Heading>
        <Text className="mt-2 max-w-prose text-ui-fg-subtle">
          {MENU_TEXT[locale].intro}
        </Text>
      </header>
      <Dishes
        initial={result.menu}
        locale={locale}
        restaurantId={current.restaurant.id}
        initialSaved={saved === "1"}
      />
    </div>
  )
}
