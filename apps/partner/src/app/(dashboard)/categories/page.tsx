import { getMessages } from "@lib/i18n"
import { menuArrangementRequest } from "@lib/data/menu-arrangement"
import { Categories } from "@modules/menu/components/categories"

export default async function CategoriesPage() {
  const { locale } = await getMessages()
  const result = await menuArrangementRequest()
  return (
    <Categories
      initial={result.menu?.categories}
      initialArrangement={result.menu}
      locale={locale}
      headingLevel="h1"
    />
  )
}
