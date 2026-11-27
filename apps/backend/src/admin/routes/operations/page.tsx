import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath, ChartActivity } from "@medusajs/icons"
import { Alert, Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { CountBarChart } from "../../components/count-bar-chart"
import { LoadingStatus } from "../../components/loading-status"
import { sdk } from "../../lib/restaurant-api"
import {
  formatCalculatedAt,
  openOrderStageLabels,
  type Operations,
} from "../../lib/operations-api"
import { useFeatureFlag } from "../../lib/use-feature-flag"

function OpenOrdersBody({
  isLoading,
  figures,
  calculatedAt,
  onRetry,
}: Readonly<{
  isLoading: boolean
  figures: Operations | undefined
  calculatedAt: string | null
  onRetry: () => void
}>) {
  if (isLoading) return <LoadingStatus label="Calculating Open Orders…" />
  if (!figures)
    return (
      <div className="flex flex-col items-start gap-3 px-6 py-4">
        <Alert variant="error">Could not load the operations figures.</Alert>
        <Button size="small" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  return (
    <CountBarChart
      rows={figures.open_orders.stages.map(({ stage, count }) => ({
        key: stage,
        label: openOrderStageLabels[stage],
        count,
      }))}
      total={figures.open_orders.total}
      categoryHeader="Stage"
      valueHeader="Open Orders"
      caption={`Open Orders by stage across all Restaurants at ${calculatedAt} (Copenhagen time), total ${figures.open_orders.total}`}
    />
  )
}

/**
 * How the platform is doing right now (#54), for MTOGO operators. Every
 * figure is calculated for the one moment shown at the top; the page reads
 * again only when the operator refreshes, and never polls. #259 adds Open
 * Orders by stage. Shown only while the backend releases the Feature.
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

  if (flags.isLoading) return <LoadingStatus label="Loading Operations…" />
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
  if (!flags.isReleased)
    return (
      <Container>
        <Heading>Operations</Heading>
        <Text>Operations monitoring is not released yet.</Text>
      </Container>
    )

  const figures = operations.data
  const calculatedAt = figures ? formatCalculatedAt(figures.as_of) : null
  const isRecalculating = operations.isFetching && !operations.isLoading
  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading>Operations</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            How the platform is doing right now, across all Restaurants.
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
              "Not calculated yet"
            )}
          </Text>
          <Button
            size="small"
            variant="secondary"
            onClick={() => void operations.refetch()}
            isLoading={operations.isFetching}
            disabled={operations.isFetching}
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

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading level="h2">Open Orders by stage</Heading>
            <Text
              size="small"
              leading="compact"
              className="max-w-prose text-ui-fg-subtle"
            >
              Not cancelled and not yet handed over, across all Restaurants
              {calculatedAt ? ` at ${calculatedAt}` : ""}. Includes Orders
              without a placement time.
            </Text>
          </div>
          {figures && (
            <div className="flex items-baseline gap-x-1.5">
              <Text
                size="xlarge"
                leading="compact"
                weight="plus"
                className="tabular-nums"
              >
                {figures.open_orders.total}
              </Text>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                open
              </Text>
            </div>
          )}
        </div>
        <div
          aria-busy={isRecalculating}
          className={clx(
            "divide-y transition-opacity duration-150 ease-out",
            isRecalculating && "opacity-60",
          )}
        >
          <OpenOrdersBody
            isLoading={operations.isLoading}
            figures={figures}
            calculatedAt={calculatedAt}
            onRetry={() => void operations.refetch()}
          />
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Operations",
  icon: ChartActivity,
})
export default OperationsPage
