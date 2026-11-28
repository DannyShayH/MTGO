import { ArrowRightMini } from "@medusajs/icons"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { CountBarChart } from "./count-bar-chart"
import { Headline } from "./volume-figures"
import {
  causeGroupLabels,
  causeLabels,
  formatPeriodEdge,
  formatRate,
  formatRating,
  type Operations,
} from "../lib/operations-api"

/** One small figure in a row of them: a muted label over its count. */
function Stat({
  label,
  count,
  note,
}: Readonly<{ label: string; count: number; note?: string }>) {
  return (
    <div className="flex min-w-0 flex-col gap-y-0.5">
      <dt>
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
          {label}
        </Text>
      </dt>
      <dd className="flex items-baseline gap-x-1.5">
        <Text
          size="small"
          leading="compact"
          weight="plus"
          className={clx("tabular-nums", count === 0 && "text-ui-fg-muted")}
        >
          {count}
        </Text>
        {note && (
          <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
            {note}
          </Text>
        )}
      </dd>
    </div>
  )
}

/**
 * The Unfulfilled Order rate among the Orders placed in the last 24 hours
 * (#263). The rate carries its denominator right under it; the row below
 * splits the Unfulfilled Orders by party and sets the still-open Orders
 * apart, so they cannot be read into the rate; the bars give every cause,
 * Customer first, then Restaurant and MTOGO, with their table underneath.
 */
export function UnfulfilledOrdersCard({
  figures,
  className,
}: Readonly<{ figures: Operations; className?: string }>) {
  const unfulfilled = figures.unfulfilled_orders
  const stillOpen =
    unfulfilled.exclusions.find(({ reason }) => reason === "still_open")
      ?.count ?? 0
  const rate = formatRate(unfulfilled.rate_percent)
  const from = formatPeriodEdge(unfulfilled.period.starts_at)
  const to = formatPeriodEdge(unfulfilled.period.ends_at)
  return (
    <Container
      role="region"
      aria-labelledby="operations-unfulfilled"
      className={clx("flex min-w-0 flex-col divide-y p-0", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h3" id="operations-unfulfilled">
            Unfulfilled Orders by cause
          </Heading>
          <Text
            size="small"
            leading="compact"
            className="max-w-prose text-ui-fg-subtle"
          >
            Ended without the food handed over, all Restaurants.
          </Text>
        </div>
        <div className="flex flex-col gap-y-1 sm:items-end">
          <Headline
            value={rate ?? "No rate"}
            unit={rate ? "unfulfilled" : ""}
          />
          <Text
            size="small"
            leading="compact"
            className="tabular-nums text-ui-fg-subtle"
          >
            {unfulfilled.unfulfilled} of {unfulfilled.ended} ended Orders
          </Text>
        </div>
      </div>
      <dl className="flex flex-wrap items-start gap-x-8 gap-y-3 px-6 py-3">
        {unfulfilled.groups.map(({ group, count }) => (
          <Stat key={group} label={causeGroupLabels[group]} count={count} />
        ))}
        {/* Apart from the parties: these Orders have not ended. */}
        <div className="flex border-ui-border-base sm:ml-auto sm:border-l sm:pl-8">
          <Stat label="Still open" count={stillOpen} note="not in the rate" />
        </div>
      </dl>
      <CountBarChart
        rows={unfulfilled.causes.map(({ cause, count }) => ({
          key: cause,
          label: causeLabels[cause],
          count,
        }))}
        total={unfulfilled.unfulfilled}
        categoryHeader="Cause"
        valueHeader="Unfulfilled Orders"
        labelWidth={220}
        caption={`Unfulfilled Orders by cause among the Orders placed across all Restaurants from ${from} to ${to} (Copenhagen time): ${unfulfilled.unfulfilled} of ${unfulfilled.ended} ended, ${stillOpen} still open and not counted`}
      />
    </Container>
  )
}

/**
 * #51's platform-wide experience rating for its last 30 days (#263), the
 * figure the Feedback page shows, linking there. It keeps its own height
 * beside the taller chart rather than stretching into empty space. Absent
 * from the read for one Restaurant's view, so nothing is drawn then.
 */
export function CustomerRatingCard({
  figures,
  className,
}: Readonly<{ figures: Operations; className?: string }>) {
  const rating = figures.customer_rating
  if (!rating) return null
  const average = formatRating(rating.average)
  return (
    <Container
      role="region"
      aria-labelledby="operations-customer-rating"
      className={clx(
        "flex min-w-0 flex-col divide-y p-0 lg:self-start",
        className,
      )}
    >
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h3" id="operations-customer-rating">
          Average Customer rating
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Overall experience, all Restaurants.
        </Text>
      </div>
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Headline
          value={average ?? "No ratings"}
          unit={average ? "of 5" : ""}
        />
        <Text
          size="small"
          leading="compact"
          className="tabular-nums text-ui-fg-subtle"
        >
          {rating.count === 1 ? "1 rating" : `${rating.count} ratings`}
        </Text>
        <Text
          size="xsmall"
          leading="compact"
          className="tabular-nums text-ui-fg-muted"
        >
          Last 30 days, {formatPeriodEdge(rating.period.starts_at)} –{" "}
          {formatPeriodEdge(rating.period.ends_at)}
        </Text>
      </div>
      <div className="px-6 py-3">
        <Link
          to="/feedback"
          className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus inline-flex items-center gap-x-1 rounded-sm outline-none transition-colors"
        >
          View Feedback
          <ArrowRightMini aria-hidden />
        </Link>
      </div>
    </Container>
  )
}
