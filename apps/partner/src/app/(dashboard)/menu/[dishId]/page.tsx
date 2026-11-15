import Link from "next/link"
import { notFound } from "next/navigation"
import { DISH_TEXT } from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { dishRequest } from "@lib/data/menu-dishes"
import { retrieveFoodCatalogue } from "@lib/data/food-catalogue"
import { EditDishForm } from "@modules/menu/components/edit-dish"

export default async function EditDishPage({
  params,
}: {
  params: Promise<{ dishId: string }>
}) {
  const { dishId } = await params
  const { locale } = await getMessages()
  const result = await dishRequest()
  const catalogue = await retrieveFoodCatalogue()
  const text = DISH_TEXT[locale]
  if (result.error || !catalogue)
    return (
      <Container role="alert" className="mx-auto max-w-3xl">
        <Text>{text.load_error}</Text>
        <Link
          href={`/menu/${encodeURIComponent(dishId)}`}
          className="mt-3 inline-flex min-h-11 items-center text-mtogo-text-link underline"
        >
          {text.retry}
        </Link>
      </Container>
    )
  const dish = result.menu?.categories
    .flatMap(({ dishes }) => dishes)
    .find(({ id }) => id === dishId)
  if (!dish) notFound()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/menu"
        className="inline-flex min-h-11 w-fit items-center text-mtogo-text-link underline"
      >
        {text.back}
      </Link>
      <Heading level="h1">{text.edit}</Heading>
      <EditDishForm dish={dish} locale={locale} catalogue={catalogue} />
    </div>
  )
}
