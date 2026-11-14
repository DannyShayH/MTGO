import { randomUUID } from "node:crypto"
import Link from "next/link"
import { DISH_TEXT } from "@dtc/i18n"
import { Heading, Container, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveMenuCategories } from "@lib/data/menu-categories"
import { Dishes } from "@modules/menu/components/dishes"

export default async function CreateDishPage() {
  const current = await requireCurrentStaff()
  const { locale } = await getMessages()
  const categories = await retrieveMenuCategories()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/menu"
        className="inline-flex min-h-11 w-fit items-center rounded text-ui-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
      >
        {DISH_TEXT[locale].back}
      </Link>
      <Heading level="h1">{DISH_TEXT[locale].add}</Heading>
      {!categories.categories ? (
        <Container role="alert">
          <Text>{DISH_TEXT[locale].category_load_error}</Text>
          <Link
            href="/menu/new"
            className="mt-3 inline-flex min-h-11 items-center rounded px-3 text-mtogo-text-link underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
          >
            {DISH_TEXT[locale].retry}
          </Link>
        </Container>
      ) : (
        <Dishes
          locale={locale}
          restaurantId={current.restaurant.id}
          initialCategories={categories.categories}
          initialEditor={{
            request_id: randomUUID(),
            category_id: categories.categories?.[0]?.id ?? "",
            name: { da: "", en: "" },
            price: "",
          }}
        />
      )}
    </div>
  )
}
