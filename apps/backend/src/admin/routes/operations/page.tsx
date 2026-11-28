import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, ChartActivity } from "@medusajs/icons"
import { Alert, Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { CountBarChart } from "../../components/count-bar-chart"
import { OperationsSkeleton } from "../../components/operations-skeleton"
import { SectionDefinitions } from "../../components/section-definitions"
import { SpeedFigures, TimesPerDayChart } from "../../components/speed-figures"
import {
  OrdersPerHourChart,
  PlacementsCard,
  PlacementsPerDayChart,
} from "../../components/volume-figures"
import { WorkWaitingFigures } from "../../components/work-waiting-figures"
import { sdk } from "../../lib/restaurant-api"
import {
  formatCalculatedAt,
  formatDay,
  formatPeriodEdge,
  openOrderStageLabels,
  type Operations,
} from "../../lib/operations-api"
import { operationsDefinitions } from "../../lib/operations-definitions"
import { useFeatureFlag } from "../../lib/use-feature-flag"

/** Open Orders by stage: the total in the header, the stages as bars. */
function OpenOrdersCard({ figures }: Readonly<{ figures: Operations }>) {
  const { open_orders: open } = figures
  return (
    <Container
      role="region"
      aria-labelledby="operations-open-orders"
      className="divide-y p-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h3" id="operations-open-orders">
            Open Orders by stage
          </Heading>
          <Text
            size="small"
            leading="compact"
            className="max-w-prose text-ui-fg-subtle"
          >
            Not cancelled and not yet handed over, all Restaurants.
          </Text>
        </div>
        <div className="flex items-baseline gap-x-1.5">
          <Text
            size="xlarge"
            leading="compact"
            weight="plus"
            className="tabular-nums"
          >
            {open.total}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            open
          </Text>
        </div>
      </div>
      <CountBarChart
        rows={open.stages.map(({ stage, count }) => ({
          key: stage,
          label: openOrderStageLabels[stage],
          count,
        }))}
        total={open.total}
        categoryHeader="Stage"
        valueHeader="Open Orders"
        caption={`Open Orders by stage across all Restaurants at ${formatCalculatedAt(figures.as_of)} (Copenhagen time), total ${open.total}`}
      />
    </Container>
  )
}

/**
 * A group of figures that share one period, named once above them so each
 * card only says what it counts. The period is Copenhagen time.
 */
function PeriodSection({
  id,
  title,
  period,
  info,
  children,
}: Readonly<{
  id: string
  title: string
  period: ReactNode
  /** An info button for the section's definitions, after the period. */
  info?: ReactNode
  children: ReactNode
}>) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 pt-2">
        <Heading level="h2" id={id}>
          {title}
        </Heading>
        <Text
          size="small"
          leading="compact"
          className="text-ui-fg-muted tabular-nums"
        >
          {period}
        </Text>
        {info}
      </div>
      {children}
    </section>
  )
}

/**
 * How the platform is doing right now (#54), for MTOGO operators. Every
 * figure is calculated for the one moment shown at the top; the page reads
 * again only when the operator refreshes, and never polls. #259 adds Open
 * Orders by stage; #260 adds the work waiting: unassigned deliveries,
 * deliveries needing attention and unresolved Full refunds, as counts that
 * link to the pages listing them; #261 adds the Order volume: placements in
 * the last 24 hours, Orders per hour and placements per day with the
 * seven-day average; #262 adds Order processing time and Delivery transit
 * time for the Orders handed over in the last 24 hours, each against the
 * previous seven days, and their averages per day over those seven days. Shown only while
 * the backend releases the Feature.
 */
const OperationsPage = () => {
  const flags = useFeatureFlag("operations_monitoring")
  const operations = useQuery({
    queryKey: ["admin-operations"],
    queryFn: () => sdk.client.fetch<Operations>("/admin/operations"),
    enabled: flags.isReleased,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  if (flags.error)
    return (
      <Container className="flex flex-col items-start gap-3">
        <Alert variant="error">Could not load Feature flags.</Alert>
        <Button
          size="small"
          variant="secondary"
          onClick={() => void flags.refetch()}
        >
          Try again
        </Button>
      </Container>
    )
  if (!flags.isLoading && !flags.isReleased)
    return (
      <Container>
        <Heading>Operations</Heading>
        <Text>Operations monitoring is not released yet.</Text>
      </Container>
    )

  const figures = operations.data
  const calculatedAt = figures ? formatCalculatedAt(figures.as_of) : null
  const isRecalculating = operations.isFetching && !operations.isLoading
  const pendingStatus = operations.error ? "Not calculated yet" : "Calculating…"
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading>Operations</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            How the platform is doing, across all Restaurants.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Text
            size="small"
            leading="compact"
            className="text-ui-fg-subtle"
            aria-live="polite"
          >
            {figures && calculatedAt ? (
              <>
                Calculated at{" "}
                <time
                  dateTime={figures.as_of}
                  className="tabular-nums text-ui-fg-base"
                >
                  {calculatedAt}
                </time>{" "}
                (Copenhagen time)
              </>
            ) : (
              pendingStatus
            )}
          </Text>
          <Button
            size="small"
            variant="secondary"
            onClick={() => void operations.refetch()}
            isLoading={operations.isFetching}
            disabled={!flags.isReleased || operations.isFetching}
          >
            <ArrowPath />
            Refresh
          </Button>
        </div>
      </Container>

      {operations.error && figures && (
        <Alert variant="warning" dismissible={false}>
          Could not refresh. The figures below are still those calculated at{" "}
          {calculatedAt}.
        </Alert>
      )}

      {/* The flags and the first calculation both show the page's shape. */}
      {!figures && !operations.error && <OperationsSkeleton />}

      {!figures && operations.error && (
        <Container className="flex flex-col items-start gap-3 px-6 py-4">
          <Alert variant="error">Could not load the operations figures.</Alert>
          <Button
            size="small"
            variant="secondary"
            onClick={() => void operations.refetch()}
          >
            Try again
          </Button>
        </Container>
      )}

      {figures && calculatedAt && (
        <div
          aria-busy={isRecalculating}
          className={clx(
            "flex flex-col gap-y-6 transition-opacity duration-150 ease-out",
            isRecalculating && "opacity-60",
          )}
        >
          <PeriodSection
            id="operations-now"
            title="Right now"
            period={`as of ${calculatedAt}`}
            info={<SectionDefinitions {...operationsDefinitions.now} />}
          >
            <WorkWaitingFigures figures={figures} />
            <OpenOrdersCard figures={figures} />
          </PeriodSection>

          <PeriodSection
            id="operations-last-24-hours"
            title="Last 24 hours"
            period={`${formatPeriodEdge(figures.placements.period.starts_at)} – ${formatPeriodEdge(figures.placements.period.ends_at)}`}
            info={<SectionDefinitions {...operationsDefinitions.last24Hours} />}
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <PlacementsCard figures={figures} />
              <OrdersPerHourChart
                figures={figures}
                calculatedAt={calculatedAt}
                className="lg:col-span-2"
              />
            </div>
          </PeriodSection>

          <PeriodSection
            id="operations-previous-7-days"
            title="Previous 7 days"
            period={`${formatDay(figures.placements_per_day.days[0].date)} – ${formatDay(figures.placements_per_day.days.at(-1)!.date)}, complete days`}
            info={
              <SectionDefinitions {...operationsDefinitions.previous7Days} />
            }
          >
            <PlacementsPerDayChart figures={figures} />
          </PeriodSection>

          <PeriodSection
            id="operations-speed"
            title="Processing and transit time"
            period="last 24 hours against the previous 7 days, all Restaurants"
            info={<SectionDefinitions {...operationsDefinitions.speed} />}
          >
            <SpeedFigures figures={figures} />
            <TimesPerDayChart figures={figures} />
          </PeriodSection>
        </div>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Operations",
  icon: ChartActivity,
})
export default OperationsPage
