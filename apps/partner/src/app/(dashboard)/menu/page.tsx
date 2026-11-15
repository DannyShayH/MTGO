import { MENU_TEXT } from "@dtc/i18n"
import { Heading, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { menuArrangementRequest } from "@lib/data/menu-arrangement"
import { ArrangedDishes } from "@modules/menu/components/arranged-dishes"

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const { locale } = await getMessages()
  const result = await menuArrangementRequest()
  const { saved } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Heading level="h1">{MENU_TEXT[locale].title}</Heading>
        <Text className="mt-2 max-w-prose text-ui-fg-subtle">
          {MENU_TEXT[locale].intro}
        </Text>
      </header>
      <ArrangedDishes
        initial={result.menu}
        locale={locale}
        initialSaved={saved === "1"}
      />
    </div>
  )
}
