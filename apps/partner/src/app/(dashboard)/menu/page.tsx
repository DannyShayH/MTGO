import Link from "next/link"
import { MENU_TEXT } from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveFoodCatalogue } from "@lib/data/food-catalogue"
import { Catalogue } from "@modules/menu/components/catalogue"

export default async function MenuPage() {
  await requireCurrentStaff()
  const { locale } = await getMessages()
  const text = MENU_TEXT[locale]
  const catalogue = await retrieveFoodCatalogue()
  const complete =
    catalogue &&
    catalogue.allergens.length === 14 &&
    catalogue.food_labels.length === 3
  return (
    <div className="flex flex-col gap-y-6">
      <header>
        <Heading level="h1">{text.title}</Heading>
        <Text className="text-ui-fg-subtle mt-2 max-w-prose">{text.intro}</Text>
      </header>
      {complete ? (
        <Catalogue catalogue={catalogue} locale={locale} />
      ) : (
        <Container className="rounded-card" role="alert">
          <Heading level="h2">{text.unavailable}</Heading>
          <Text className="text-ui-fg-subtle mt-2">{text.retry_hint}</Text>
          <Link
            href="/menu"
            className="focus-visible:ring-mtogo-focus-ring mt-4 inline-flex min-h-11 items-center rounded border border-mtogo-border-control px-4 font-medium focus-visible:outline-none focus-visible:ring-2"
          >
            {text.retry}
          </Link>
        </Container>
      )}
    </div>
  )
}
