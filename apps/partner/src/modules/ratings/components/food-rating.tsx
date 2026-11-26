import Link from "next/link"
import {
  formatFoodRatingAverage,
  formatText,
  RESTAURANT_RATINGS_TEXT,
  starsLabel,
  type Locale,
} from "@dtc/i18n"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import type { FoodRatingStatistics } from "@lib/data/ratings"
import {
  RATINGS_PERIODS,
  ratingsHref,
  type RatingsPeriod,
} from "@lib/ratings-period"

/** The three periods as links, so the choice lives in the address. */
export function PeriodChoice({
  selected,
  locale,
}: {
  selected: RatingsPeriod
  locale: Locale
}) {
  const text = RESTAURANT_RATINGS_TEXT[locale]
  return (
    <nav aria-label={text.period}>
      <ul className="bg-ui-bg-subtle shadow-borders-base inline-flex flex-wrap gap-1 rounded-lg p-1">
        {RATINGS_PERIODS.map((period) => {
          const isCurrent = period === selected
          return (
            <li key={period}>
              <Link
                href={ratingsHref(period)}
                aria-current={isCurrent ? "page" : undefined}
                className={clx(
                  "txt-compact-small-plus focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center rounded-md px-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
                  isCurrent
                    ? "bg-ui-bg-base text-ui-fg-base shadow-elevation-card-rest"
                    : "text-ui-fg-subtle hover:text-ui-fg-base",
                )}
              >
                {text[`period_${period}`]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="xlarge" weight="plus" className="tabular-nums">
        {value}
      </Text>
    </div>
  )
}

/**
 * The period's food rating: its average or "No ratings yet", the count, the
 * delivered Orders and the 1-5 distribution. Nothing names who rated.
 */
export function FoodRating({
  food,
  locale,
}: {
  food: FoodRatingStatistics["food"]
  locale: Locale
}) {
  const text = RESTAURANT_RATINGS_TEXT[locale]
  const number = new Intl.NumberFormat(locale === "da" ? "da-DK" : "en-GB")
  const largest = Math.max(...Object.values(food.distribution), 1)
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <Container className="rounded-card flex flex-col gap-4 px-4 py-5 sm:px-6">
        <Heading level="h2">{text.food_rating}</Heading>
        {food.average === null ? (
          <div className="flex flex-col gap-1">
            <Text size="xlarge" weight="plus">
              {text.no_ratings}
            </Text>
            <Text size="small" className="text-ui-fg-subtle max-w-prose">
              {text.no_ratings_hint}
            </Text>
          </div>
        ) : (
          <Text
            size="xlarge"
            weight="plus"
            className="text-[2rem] leading-tight tabular-nums"
          >
            {formatFoodRatingAverage(food.average, locale)}
          </Text>
        )}
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Figure
            label={text.ratings_count}
            value={number.format(food.count)}
          />
          <Figure
            label={text.delivered_orders}
            value={number.format(food.delivered_orders)}
          />
        </div>
      </Container>
      {food.count > 0 && (
        <Container className="rounded-card flex flex-col gap-3 px-4 py-5 sm:px-6">
          <Heading level="h2">{text.distribution}</Heading>
          <ul className="flex flex-col gap-2">
            {(["5", "4", "3", "2", "1"] as const).map((stars) => {
              const count = food.distribution[stars]
              const label = starsLabel(Number(stars), locale)
              return (
                <li
                  key={stars}
                  className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3"
                  aria-label={formatText(text.distribution_row, {
                    stars: label,
                    count: number.format(count),
                  })}
                >
                  <Text size="small" aria-hidden="true">
                    {label}
                  </Text>
                  <div
                    aria-hidden="true"
                    className="bg-ui-bg-subtle h-3 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-ui-fg-interactive h-full rounded-full"
                      style={{ width: `${(count / largest) * 100}%` }}
                    />
                  </div>
                  <Text
                    size="small"
                    aria-hidden="true"
                    className="text-right tabular-nums"
                  >
                    {number.format(count)}
                  </Text>
                </li>
              )
            })}
          </ul>
        </Container>
      )}
    </div>
  )
}
