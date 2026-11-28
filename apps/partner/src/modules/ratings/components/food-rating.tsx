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
      {/* Three equal segments that never wrap; on a phone they share the
          width, and a long label takes two lines inside its own segment. */}
      <ul className="bg-ui-bg-subtle shadow-borders-base grid grid-cols-3 gap-1 rounded-lg p-1 sm:inline-grid">
        {RATINGS_PERIODS.map((period) => {
          const isCurrent = period === selected
          return (
            <li key={period}>
              <Link
                prefetch={false}
                href={ratingsHref(period)}
                aria-current={isCurrent ? "page" : undefined}
                className={clx(
                  "txt-compact-small-plus focus-visible:ring-mtogo-focus-ring flex h-full min-h-11 items-center justify-center rounded-md px-2 py-1 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:px-4",
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
      <Text size="xlarge" weight="plus">
        {value}
      </Text>
    </div>
  )
}

const STAR_PATH =
  "M8 1.25l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 11.76l-4.12 2.16.79-4.58L1.34 6.09l4.6-.67L8 1.25z"

/** Five stars in a row, 16px each with 4px between them. */
function StarRow({ className }: Readonly<{ className: string }>) {
  return (
    <svg
      width="96"
      height="16"
      viewBox="0 0 96 16"
      className={clx("shrink-0", className)}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <path
          key={index}
          d={STAR_PATH}
          transform={`translate(${index * 20} 0)`}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

/**
 * The average as five stars filled to the same share, over five grey ones.
 * It repeats the number beside it, so screen readers skip it.
 */
function StarMeter({ average }: Readonly<{ average: number }>) {
  // Star n spans 20(n-1) to 20(n-1)+16 of the 96 pixels.
  const whole = Math.floor(average)
  const filled = Math.min(96, whole * 20 + (average - whole) * 16)
  return (
    <div aria-hidden="true" className="relative h-4 w-24">
      <StarRow className="text-ui-border-strong absolute inset-0" />
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: filled }}
      >
        <StarRow className="text-ui-tag-orange-icon" />
      </div>
    </div>
  )
}

/** "4,2" and "ud af 5", from the one translated "{average} ud af 5". */
function averageParts(average: number, locale: Locale) {
  const whole = formatFoodRatingAverage(average, locale)
  const value = new Intl.NumberFormat(locale === "da" ? "da-DK" : "en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average)
  return { value, unit: whole.replace(value, "").trim() }
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
    // Side by side on a wide screen: the summary on the left, its spread on
    // the right, so neither card runs the full width with little in it.
    <div
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      aria-live="polite"
    >
      <Container className="rounded-card flex flex-col gap-5 px-4 py-5 sm:px-6">
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
          <div className="flex flex-col gap-2">
            {/* The number leads; "out of 5" is its unit, so it is smaller. */}
            <p className="flex items-baseline gap-x-2">
              <span className="text-ui-fg-base text-[2.5rem] font-medium leading-none tracking-tight">
                {averageParts(food.average, locale).value}
              </span>
              <span className="txt-medium text-ui-fg-subtle">
                {averageParts(food.average, locale).unit}
              </span>
            </p>
            <StarMeter average={food.average} />
          </div>
        )}
        <div className="border-ui-border-base grid grid-cols-2 gap-4 border-t pt-4">
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
        <Container className="rounded-card flex flex-col gap-4 px-4 py-5 sm:px-6">
          <Heading level="h2">{text.distribution}</Heading>
          <ul className="flex flex-col gap-3">
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
                    className={clx(
                      "text-right tabular-nums",
                      count === 0 && "text-ui-fg-muted",
                    )}
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
