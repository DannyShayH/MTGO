import Link from "next/link"
import { notFound } from "next/navigation"
import {
  formatOperationsCalculatedAt,
  formatOperationsDay,
  formatOperationsMoment,
  RESTAURANT_OPERATIONS_TEXT,
} from "@dtc/i18n"
import { ArrowRightMini } from "@medusajs/icons"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"
import { requireCurrentStaff } from "@lib/data/staff"
import { retrieveRestaurantOperations } from "@lib/data/operations"
import { LINK_BUTTON } from "@modules/common/link-button"
import {
  OpenOrdersCard,
  OrdersPerHourCard,
  PeriodSection,
  PlacementsCard,
  PlacementsPerDayCard,
  ProcessingTimeCard,
  UnfulfilledOrdersCard,
} from "@modules/operations/components/operations-figures"
import { RefreshButton } from "@modules/operations/components/refresh-button"

/**
 * Drift / Operations (#264): the Restaurant's own Open Orders, volume,
 * Order processing time and Unfulfilled Orders, with the definitions MTOGO
 * operators see for it. Shown only while the backend releases the Feature.
 * The food rating stays on the Ratings page.
 */
export default async function OperationsPage() {
  const current = await requireCurrentStaff()
  if (!current.features?.operations_monitoring) notFound()
  const { locale } = await getMessages()
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const figures = await retrieveRestaurantOperations(current.restaurant.id)
  if (figures === "not_found") notFound()

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Heading level="h1">{text.title}</Heading>
          <Text className="text-ui-fg-subtle max-w-prose">{text.intro}</Text>
        </div>
        {figures && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Text size="small" className="text-ui-fg-subtle" aria-live="polite">
              {text.calculated_at}{" "}
              <time
                dateTime={figures.as_of}
                className="text-ui-fg-base tabular-nums"
              >
                {formatOperationsCalculatedAt(figures.as_of, locale)}
              </time>
            </Text>
            <RefreshButton
              label={text.refresh}
              pendingLabel={text.refreshing}
            />
          </div>
        )}
      </header>

      {figures ? (
        <>
          <PeriodSection
            id="operations-now"
            title={text.now}
            period={formatOperationsMoment(figures.as_of, locale)}
          >
            <OpenOrdersCard figures={figures} locale={locale} />
          </PeriodSection>

          <PeriodSection
            id="operations-last-24-hours"
            title={text.last_24_hours}
            period={`${formatOperationsMoment(figures.placements.period.starts_at, locale)} – ${formatOperationsMoment(figures.placements.period.ends_at, locale)}`}
          >
            <OrdersPerHourCard figures={figures} locale={locale} />
            {/* Placements and processing time stack beside the Unfulfilled
                Orders, about as tall together, so neither side leaves a gap. */}
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-3">
                <PlacementsCard figures={figures} locale={locale} />
                <ProcessingTimeCard
                  figures={figures}
                  locale={locale}
                  className="flex-1"
                />
              </div>
              <UnfulfilledOrdersCard
                figures={figures}
                locale={locale}
                className="lg:col-span-2"
              />
            </div>
          </PeriodSection>

          <PeriodSection
            id="operations-previous-7-days"
            title={text.previous_7_days}
            period={`${formatOperationsDay(figures.placements_per_day.days[0].date, locale)} – ${formatOperationsDay(figures.placements_per_day.days.at(-1)!.date, locale)}, ${text.complete_days}`}
          >
            <PlacementsPerDayCard figures={figures} locale={locale} />
          </PeriodSection>

          <div className="flex flex-col gap-1">
            <Link
              prefetch={false}
              href="/ratings"
              className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:ring-mtogo-focus-ring inline-flex min-h-11 items-center gap-x-1 self-start rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {text.ratings_link}
              <ArrowRightMini aria-hidden="true" />
            </Link>
            <Text size="small" className="text-ui-fg-muted max-w-prose">
              {text.calculated_note}
            </Text>
          </div>
        </>
      ) : (
        <Container
          role="alert"
          className="rounded-card flex max-w-xl flex-col gap-2 px-4 py-6 sm:px-6"
        >
          <Heading level="h2">{text.unavailable_title}</Heading>
          <Text className="text-ui-fg-subtle">{text.retry_hint}</Text>
          <Link
            prefetch={false}
            href="/operations"
            className={clx(LINK_BUTTON, "mt-2 self-start")}
          >
            {text.retry}
          </Link>
        </Container>
      )}
    </div>
  )
}
