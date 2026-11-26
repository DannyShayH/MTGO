import Link from "next/link"
import { notFound } from "next/navigation"
import { RESTAURANT_RATINGS_TEXT } from "@dtc/i18n"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveFoodRating } from "@lib/data/ratings"
import { parseRatingsPeriod, ratingsHref } from "@lib/ratings-period"
import {
  FoodRating,
  PeriodChoice,
} from "@modules/ratings/components/food-rating"
import { LINK_BUTTON } from "@modules/common/link-button"

/**
 * The Restaurant's own food rating (#249): read-only, by period.
 */
export default async function RatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const current = await requireCurrentStaff()
  const { locale } = await getMessages()
  const text = RESTAURANT_RATINGS_TEXT[locale]
  const period = parseRatingsPeriod(await searchParams)
  const result = await retrieveFoodRating(current.restaurant.id, period)
  if (result === "not_found") notFound()

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Heading level="h1">{text.title}</Heading>
        <Text className="text-ui-fg-subtle max-w-prose">{text.intro}</Text>
      </header>
      <PeriodChoice selected={period} locale={locale} />
      {result ? (
        <FoodRating food={result.food} locale={locale} />
      ) : (
        <Container
          role="alert"
          className="rounded-card flex flex-col gap-2 px-4 py-6 sm:px-6"
        >
          <Heading level="h2">{text.unavailable_title}</Heading>
          <Text className="text-ui-fg-subtle">{text.retry_hint}</Text>
          <Link
            href={ratingsHref(period)}
            className={clx(LINK_BUTTON, "mt-2 self-start")}
          >
            {text.retry}
          </Link>
        </Container>
      )}
      <Text size="small" className="text-ui-fg-subtle max-w-prose">
        {text.read_only}
      </Text>
    </div>
  )
}
