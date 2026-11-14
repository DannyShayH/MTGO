import { getMessages } from "@lib/i18n"
import { retrieveMenuCategories } from "@lib/data/menu-categories"
import { Categories } from "@modules/menu/components/categories"

export default async function CategoriesPage() {
  const { locale } = await getMessages()
  const result = await retrieveMenuCategories()
  return (
    <Categories initial={result.categories} locale={locale} headingLevel="h1" />
  )
}
