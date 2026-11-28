import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, ChartActivity } from "@medusajs/icons"
import { FetchError } from "@medusajs/js-sdk"
import {
  Alert,
  Button,
  Container,
  Heading,
  Select,
  Text,
  clx,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useId, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { CountBarChart } from "../../components/count-bar-chart"
import { OperationsSkeleton } from "../../components/operations-skeleton"
import { SectionDefinitions } from "../../components/section-definitions"
import {
  CustomerRatingCard,
  UnfulfilledOrdersCard,
} from "../../components/reliability-figures"
import { SpeedFigures, TimesPerDayChart } from "../../components/speed-figures"
import {
  OrdersPerHourChart,
  PlacementsCard,
  PlacementsPerDayChart,
} from "../../components/volume-figures"
import { WorkWaitingFigures } from "../../components/work-waiting-figures"
import {
  OperationsScopeProvider,
  useScopeWording,
} from "../../components/operations-scope"
import { sdk, type Restaurant } from "../../lib/restaurant-api"
import {
  formatCalculatedAt,
  scopeWording,
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
  const scope = useScopeWording()
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
            Not cancelled and not yet handed over, {scope.across}.
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
        caption={`Open Orders by stage ${scope.across} at ${formatCalculatedAt(figures.as_of)} (Copenhagen time), total ${open.total}`}
      />
    </Container>
  )
}

/** The value the selector uses for the default, all Restaurants. */
const ALL_RESTAURANTS = "all"

/**
 * Narrows the page to one Restaurant (#264), all Restaurants by default.
 * The choice lives in the address, so a refresh or a shared link keeps it.
 * Deactivated Restaurants stay listed: their recent service still counts.
 */
function RestaurantChoice({
  restaurants,
  value,
  onChange,
  disabled,
}: Readonly<{
  restaurants: Restaurant[]
  value: string | null
  onChange: (restaurantId: string | null) => void
  disabled: boolean
}>) {
  const labelId = useId()
  return (
    <div className="flex min-w-0 items-center gap-x-2">
      <Text
        size="small"
        leading="compact"
        weight="plus"
        id={labelId}
        className="shrink-0"
      >
        Restaurant
      </Text>
      <Select
        size="small"
        value={value ?? ALL_RESTAURANTS}
        onValueChange={(next) =>
          onChange(next === ALL_RESTAURANTS ? null : next)
        }
        disabled={disabled}
      >
        <Select.Trigger aria-labelledby={labelId} className="w-56 max-w-[60vw]">
          <Select.Value className="truncate" />
        </Select.Trigger>
        <Select.Content className="max-h-80">
          <Select.Item value={ALL_RESTAURANTS}>All Restaurants</Select.Item>
          {restaurants.map(({ id, name, is_active }) => (
            <Select.Item key={id} value={id}>
              {is_active ? name : `${name} (deactivated)`}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
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

/** The Restaurant choice kept in the address as `?restaurant=`, or none. */
function useRestaurantChoice() {
  const [params, setParams] = useSearchParams()
  const choose = (next: string | null) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next) updated.set("restaurant", next)
        else updated.delete("restaurant")
        return updated
      },
      { replace: true },
    )
  return [params.get("restaurant") || null, choose] as const
}

const scopeOf = (restaurantId: string | null): Operations["scope"] =>
  restaurantId
    ? { type: "restaurant", restaurant_id: restaurantId }
    : { type: "platform" }

/**
 * The name the page uses for the figures shown, not for the choice: while
 * another choice calculates, the dimmed figures keep the name they were
 * calculated for. Null means all Restaurants.
 */
const nameOf = (scope: Operations["scope"], restaurants?: Restaurant[]) => {
  if (scope.type === "platform") return null
  return (
    restaurants?.find(({ id }) => id === scope.restaurant_id)?.name ??
    "the chosen Restaurant"
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
 * previous seven days, and their averages per day over those seven days;
 * #263 adds the Unfulfilled Order rate by cause and the average Customer
 * rating; #264 adds the Restaurant choice, all Restaurants by default, with
 * the same figures the chosen Restaurant's staff see. Shown only while the
 * backend releases the Feature.
 */
const OperationsPage = () => {
  const flags = useFeatureFlag("operations_monitoring")
  const [restaurantId, chooseRestaurant] = useRestaurantChoice()
  const restaurants = useQuery({
    queryKey: ["operations-restaurant-choice"],
    queryFn: () =>
      sdk.client.fetch<{ restaurants: Restaurant[]; count: number }>(
        "/admin/restaurants",
        { query: { limit: 100 } },
      ),
    enabled: flags.isReleased,
    select: ({ restaurants }) =>
      [...restaurants].sort((a, b) => a.name.localeCompare(b.name, "da")),
  })
  const operations = useQuery({
    queryKey: ["admin-operations", restaurantId ?? ALL_RESTAURANTS],
    queryFn: () =>
      sdk.client.fetch<Operations>("/admin/operations", {
        query: restaurantId ? { restaurant_id: restaurantId } : {},
      }),
    enabled: flags.isReleased,
    // The previous figures stay, dimmed, while another choice calculates.
    placeholderData: keepPreviousData,
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
  const shownScope = figures?.scope ?? scopeOf(restaurantId)
  const scope = scopeWording(nameOf(shownScope, restaurants.data))
  const definitions = operationsDefinitions(scope.across)
  const isUnknownRestaurant =
    !!restaurantId &&
    operations.error instanceof FetchError &&
    operations.error.status === 404
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading>Operations</Heading>
          <Text
            size="small"
            leading="compact"
            className="break-words text-ui-fg-subtle"
          >
            {shownScope.type === "restaurant"
              ? `How ${scope.label} is doing, with the definitions its staff see.`
              : "How the platform is doing, across all Restaurants."}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <RestaurantChoice
            restaurants={restaurants.data ?? []}
            value={restaurantId}
            onChange={chooseRestaurant}
            disabled={!flags.isReleased || !restaurants.data}
          />
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

      {isUnknownRestaurant && (
        <Container className="flex flex-col items-start gap-3 px-6 py-4">
          <Alert variant="error">
            The chosen Restaurant was not found. It may have been removed, or
            the link is mistyped.
          </Alert>
          <Button
            size="small"
            variant="secondary"
            onClick={() => chooseRestaurant(null)}
          >
            Show all Restaurants
          </Button>
        </Container>
      )}

      {!figures && operations.error && !isUnknownRestaurant && (
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
        <OperationsScopeProvider value={scope}>
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
              info={<SectionDefinitions {...definitions.now} />}
            >
              <WorkWaitingFigures figures={figures} />
              <OpenOrdersCard figures={figures} />
            </PeriodSection>

            <PeriodSection
              id="operations-last-24-hours"
              title="Last 24 hours"
              period={`${formatPeriodEdge(figures.placements.period.starts_at)} – ${formatPeriodEdge(figures.placements.period.ends_at)}`}
              info={<SectionDefinitions {...definitions.last24Hours} />}
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
              info={<SectionDefinitions {...definitions.previous7Days} />}
            >
              <PlacementsPerDayChart figures={figures} />
            </PeriodSection>

            <PeriodSection
              id="operations-speed"
              title="Processing and transit time"
              period={`last 24 hours against the previous 7 days, ${scope.across}`}
              info={<SectionDefinitions {...definitions.speed} />}
            >
              <SpeedFigures figures={figures} />
              <TimesPerDayChart figures={figures} />
            </PeriodSection>

            <PeriodSection
              id="operations-reliability"
              title={
                figures.customer_rating
                  ? "Unfulfilled Orders and Customer rating"
                  : "Unfulfilled Orders"
              }
              period={
                figures.customer_rating
                  ? "Orders placed in the last 24 hours; ratings from the last 30 days"
                  : `Orders placed in the last 24 hours, ${scope.across}`
              }
              info={<SectionDefinitions {...definitions.reliability} />}
            >
              <div className="grid gap-3 lg:grid-cols-3">
                <UnfulfilledOrdersCard
                  figures={figures}
                  className={
                    figures.customer_rating ? "lg:col-span-2" : "lg:col-span-3"
                  }
                />
                <CustomerRatingCard figures={figures} />
              </div>
            </PeriodSection>
          </div>
        </OperationsScopeProvider>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Operations",
  icon: ChartActivity,
})
export default OperationsPage
