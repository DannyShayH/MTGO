import type { ReactNode } from "react"
import {
  formatOperationsAverage,
  formatOperationsDay,
  formatOperationsDuration,
  formatOperationsMoment,
  formatOperationsRate,
  formatText,
  operationsChangeText,
  operationsExclusionText,
  operationsHourLabels,
  operationsIncludedText,
  RESTAURANT_OPERATIONS_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import { CountBars, LegendKey, TimeBars } from "@dtc/charts"
import type {
  CancellationCategory,
  RestaurantOperations,
  UnfulfilledCause,
} from "@lib/data/operations"
import { ChartNumbers, NO_VALUE } from "./chart-numbers"

type Props = Readonly<{ figures: RestaurantOperations; locale: Locale }>
type OperationsText = (typeof RESTAURANT_OPERATIONS_TEXT)[Locale]

/**
 * The order causes are listed in everywhere, the party they lie with first
 * (Customer, then Restaurant, then MTOGO), so a number sits in the same
 * place in the cancellations and the Unfulfilled chart.
 */
const CAUSE_ORDER: readonly UnfulfilledCause[] = [
  "customer_cancelled",
  "restaurant_rejected",
  "acceptance_timeout",
  "unassigned_timeout",
  "operator_cancelled",
  "delivery_failed",
]
const inCauseOrder = <Row extends { category: CancellationCategory }>(
  rows: Row[],
) =>
  [...rows].sort(
    (a, b) => CAUSE_ORDER.indexOf(a.category) - CAUSE_ORDER.indexOf(b.category),
  )

/** A card that names what it counts, for which Orders, and its headline. */
function Card({
  id,
  title,
  description,
  headline,
  children,
  className,
}: Readonly<{
  id: string
  title: string
  description: string
  headline?: ReactNode
  children: ReactNode
  className?: string
}>) {
  return (
    <Container
      role="region"
      aria-labelledby={id}
      className={clx(
        "rounded-card flex min-w-0 flex-col divide-y p-0",
        className,
      )}
    >
      <div className="flex flex-col gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h3" id={id}>
            {title}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle max-w-prose">
            {description}
          </Text>
        </div>
        {headline}
      </div>
      {children}
    </Container>
  )
}

function Headline({
  value,
  unit,
  isMuted = false,
}: Readonly<{ value: string; unit?: string; isMuted?: boolean }>) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      {/* The card's one number, above Medusa's type scale so it leads. */}
      <span
        className={clx(
          "text-[1.75rem] font-medium leading-8 tracking-tight tabular-nums",
          isMuted ? "text-ui-fg-muted" : "text-ui-fg-base",
        )}
      >
        {value}
      </span>
      {unit && (
        <Text size="small" className="text-ui-fg-subtle">
          {unit}
        </Text>
      )}
    </div>
  )
}

/**
 * A small trend line, rising for an improvement and falling for a decline.
 * It repeats what the words say, so it is hidden from screen readers.
 */
function TrendIcon({ direction }: Readonly<{ direction: "down" | "up" }>) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clx("shrink-0", direction === "up" && "-scale-y-100")}
    >
      <polyline points="1.5,4.5 6,9 8.5,6.5 14.5,12.5" />
      <polyline points="10,12.5 14.5,12.5 14.5,8" />
    </svg>
  )
}

/**
 * The change in processing time against the previous seven days. Faster is
 * an improvement (success colours, a rising line), slower is a decline
 * (warning colours, a falling line). No change or no comparison stays plain
 * text.
 * The words always say faster or slower; colour never carries it alone.
 */
function ChangeBadge({
  change,
  children,
}: Readonly<{ change: number | null; children: ReactNode }>) {
  if (!change)
    return (
      <Text size="small" className="text-ui-fg-subtle tabular-nums">
        {children}
      </Text>
    )
  const isFaster = change < 0
  return (
    <p
      className={clx(
        "txt-compact-small-plus inline-flex items-start gap-x-1.5 rounded-md px-2 py-1.5 tabular-nums",
        isFaster
          ? "bg-mtogo-status-success-surface text-mtogo-status-success-text"
          : "bg-mtogo-status-warning-surface text-mtogo-status-warning-text",
      )}
    >
      <TrendIcon direction={isFaster ? "up" : "down"} />
      <span>{children}</span>
    </p>
  )
}

/** A group of cards sharing one period, named once above them. */
export function PeriodSection({
  id,
  title,
  period,
  children,
}: Readonly<{
  id: string
  title: string
  period: string
  children: ReactNode
}>) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Heading level="h2" id={id}>
          {title}
        </Heading>
        <Text size="small" className="text-ui-fg-muted tabular-nums">
          {period}
        </Text>
      </div>
      {children}
    </section>
  )
}

const numbersLabels = (text: OperationsText) => ({
  showLabel: text.show_numbers,
  hideLabel: text.hide_numbers,
})

/** Open Orders by stage, the total in the header and the stages as bars. */
export function OpenOrdersCard({ figures, locale }: Props) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const { open_orders: open } = figures
  const rows = open.stages.map(({ stage, count }) => ({
    key: stage,
    label: text[`stage_${stage}`],
    count,
  }))
  return (
    <Card
      id="operations-open-orders"
      title={text.open_orders}
      description={text.open_orders_hint}
      headline={<Headline value={String(open.total)} unit={text.open_count} />}
    >
      {/* Capped inside the padding, so the divider above stays full width
          and a count of 1 is not drawn across a whole desktop. */}
      <div className="px-4 pb-2 pt-4 sm:px-6">
        <CountBars rows={rows} names="above" className="max-w-3xl" />
      </div>
      <ChartNumbers
        caption={formatText(text.open_orders_caption, {
          time: formatOperationsMoment(figures.as_of, locale),
          total: open.total,
        })}
        categoryHeader={text.stage}
        valueHeader={[text.open_count]}
        rows={rows.map(({ key, label, count }) => ({
          key,
          label,
          values: [String(count)],
        }))}
        footer={[{ label: text.total, value: [String(open.total)] }]}
        {...numbersLabels(text)}
      />
    </Card>
  )
}

/** The Orders placed in the last 24 hours and those now cancelled. */
export function PlacementsCard({ figures, locale }: Props) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const { placements } = figures
  return (
    <Card
      id="operations-placements"
      title={text.placements}
      description={text.placements_hint}
      headline={
        <Headline value={String(placements.total)} unit={text.placed_count} />
      }
    >
      <dl className="flex flex-1 flex-col gap-y-2 px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-x-3 pb-1">
          <dt>
            <Text size="small" weight="plus">
              {text.cancelled}
            </Text>
          </dt>
          <dd>
            <Text size="small" weight="plus" className="tabular-nums">
              {placements.cancelled.total}
            </Text>
          </dd>
        </div>
        {inCauseOrder(placements.cancelled.categories).map(
          ({ category, count }) => (
            <div
              key={category}
              className="flex items-baseline justify-between gap-x-3"
            >
              <dt className="min-w-0">
                <Text size="small" className="text-ui-fg-subtle">
                  {text[`category_${category}`]}
                </Text>
              </dt>
              <dd>
                <Text
                  size="small"
                  className={clx(
                    "tabular-nums",
                    count === 0 && "text-ui-fg-muted",
                  )}
                >
                  {count}
                </Text>
              </dd>
            </div>
          ),
        )}
      </dl>
    </Card>
  )
}

/**
 * Placements in each of the last 24 Copenhagen clock hours. The current
 * hour is marked "so far", and the repeated hour on the night the clocks go
 * back carries its UTC offset.
 */
export function OrdersPerHourCard({
  figures,
  locale,
  className,
}: Props & { className?: string }) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const { orders_per_hour: perHour } = figures
  const labels = operationsHourLabels(perHour.hours, locale)
  const bars = perHour.hours.map((hour) => {
    const isRepeated =
      perHour.hours.filter((other) => other.local_time === hour.local_time)
        .length > 1
    return {
      key: hour.starts_at,
      tick: hour.local_time,
      notes: [
        ...(isRepeated ? [hour.utc_offset] : []),
        ...(hour.is_current ? [text.so_far] : []),
      ],
      count: hour.count,
      isPartial: hour.is_current,
      isAlwaysLabelled: isRepeated || hour.is_current,
    }
  })
  // The busiest hour, the earlier one on a tie, named without "so far".
  const peakIndex = perHour.hours.reduce(
    (best, { count }, index) =>
      count > (perHour.hours[best]?.count ?? 0) ? index : best,
    -1,
  )
  const peak =
    peakIndex >= 0
      ? operationsHourLabels(
          perHour.hours.map((hour) => ({ ...hour, is_current: false })),
          locale,
        )[peakIndex]
      : null
  return (
    <Card
      id="operations-orders-per-hour"
      title={text.orders_per_hour}
      description={formatText(text.orders_per_hour_hint, {
        from: perHour.hours[0].local_time,
      })}
      className={className}
      headline={
        peak ? (
          <Headline
            value={String(perHour.hours[peakIndex].count)}
            unit={formatText(text.peak, { hour: peak })}
          />
        ) : (
          <Headline value={text.no_orders} isMuted />
        )
      }
    >
      <TimeBars
        className="px-4 py-4 sm:px-6"
        height={200}
        tickSpacing={44}
        narrowCounts="none"
        bars={bars}
        legend={
          <>
            <LegendKey mark="bar">{text.hour_key}</LegendKey>
            <LegendKey mark="partial">{text.current_hour_key}</LegendKey>
          </>
        }
      />
      <ChartNumbers
        caption={formatText(text.orders_per_hour_caption, {
          from: formatOperationsMoment(perHour.period.starts_at, locale),
          to: formatOperationsMoment(perHour.period.ends_at, locale),
        })}
        categoryHeader={text.hour}
        valueHeader={[text.orders]}
        rows={perHour.hours.map((hour, index) => ({
          key: hour.starts_at,
          label: labels[index],
          values: [String(hour.count)],
        }))}
        footer={[{ label: text.total, value: [String(perHour.total)] }]}
        {...numbersLabels(text)}
      />
    </Card>
  )
}

/** Placements on each of the previous seven days, with their average. */
export function PlacementsPerDayCard({ figures, locale }: Props) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const { placements_per_day: perDay } = figures
  const average = formatOperationsAverage(perDay.average_per_day, locale)
  const bars = perDay.days.map(({ date, count }) => {
    // The weekday, and under it the day of the month alone: the section's
    // period names the months, and a phone has no room for more.
    const [weekday, dayOfMonth] = formatOperationsDay(date, locale).split(" ")
    return { key: date, tick: weekday, notes: [dayOfMonth], count }
  })
  return (
    <Card
      id="operations-placements-per-day"
      title={text.placements_per_day}
      description={text.placements_per_day_hint}
      headline={<Headline value={average} unit={text.average_per_day} />}
    >
      <TimeBars
        className="px-4 py-4 sm:px-6"
        height={200}
        tickSpacing={44}
        narrowCounts="none"
        bars={bars}
        average={perDay.average_per_day}
        legend={
          <>
            <LegendKey mark="bar">{text.day_key}</LegendKey>
            <LegendKey mark="line">
              {text.average_key}: {average}
            </LegendKey>
          </>
        }
      />
      <ChartNumbers
        caption={formatText(text.placements_per_day_caption, {
          first: formatOperationsDay(perDay.days[0].date, locale),
          last: formatOperationsDay(perDay.days.at(-1)!.date, locale),
        })}
        categoryHeader={text.day}
        valueHeader={[text.orders]}
        rows={perDay.days.map(({ date, count }) => ({
          key: date,
          label: formatOperationsDay(date, locale),
          values: [String(count)],
        }))}
        footer={[
          { label: text.total, value: [String(perDay.total)] },
          { label: text.average, value: [average] },
        ]}
        {...numbersLabels(text)}
      />
    </Card>
  )
}

/**
 * Order processing time for the Orders handed over in the last 24 hours,
 * against the previous seven days, with one average per day in the table.
 * The words say faster or slower; colour never carries it alone.
 */
export function ProcessingTimeCard({
  figures,
  locale,
  className,
}: Props & { className?: string }) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const measure = figures.processing_time
  const week = figures.times_per_day
  const duration = formatOperationsDuration(measure.average_seconds, locale)
  const change = measure.change_from_previous_7_days_percent
  return (
    <Card
      id="operations-processing-time"
      className={className}
      title={text.processing_time}
      description={text.processing_time_hint}
      headline={
        <Headline
          value={duration ?? text.no_average}
          unit={duration ? text.on_average : undefined}
          isMuted={!duration}
        />
      }
    >
      {/* Grows when the card is stretched beside a taller one, so the
          toggle stays at the bottom. */}
      <div className="flex flex-1 flex-col items-start gap-y-3 px-4 py-4 sm:px-6">
        <Text size="small" className="text-ui-fg-subtle tabular-nums">
          {operationsIncludedText(measure.included, locale)} ·{" "}
          {operationsExclusionText(measure.exclusions, locale)}
        </Text>
        <ChangeBadge change={change}>
          {operationsChangeText(
            change,
            week.processing_time.average_seconds,
            locale,
          )}
        </ChangeBadge>
      </div>
      <ChartNumbers
        caption={formatText(text.processing_per_day_caption, {
          first: formatOperationsDay(week.days[0].date, locale),
          last: formatOperationsDay(week.days.at(-1)!.date, locale),
        })}
        categoryHeader={text.day}
        valueHeader={[text.processing_time, text.orders]}
        rows={week.days.map(({ date, processing_time }) => ({
          key: date,
          label: formatOperationsDay(date, locale),
          values: [
            formatOperationsDuration(processing_time.average_seconds, locale) ??
              NO_VALUE,
            String(processing_time.included),
          ],
        }))}
        footer={[
          {
            label: text.average,
            value: [
              formatOperationsDuration(
                week.processing_time.average_seconds,
                locale,
              ) ?? NO_VALUE,
              String(week.processing_time.included),
            ],
          },
        ]}
        {...numbersLabels(text)}
      />
    </Card>
  )
}

/**
 * The Unfulfilled Order rate among the Orders placed in the last 24 hours,
 * by the party each cause lies with, with the Orders still open apart: they
 * are in neither number of the rate.
 */
export function UnfulfilledOrdersCard({
  figures,
  locale,
  className,
}: Props & { className?: string }) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const unfulfilled = figures.unfulfilled_orders
  const stillOpen =
    unfulfilled.exclusions.find(({ reason }) => reason === "still_open")
      ?.count ?? 0
  const rate = formatOperationsRate(unfulfilled.rate_percent, locale)
  const rows = unfulfilled.causes.map(({ cause, count }) => ({
    key: cause,
    label: text[`category_${cause}`],
    count,
  }))
  return (
    <Card
      id="operations-unfulfilled"
      className={className}
      title={text.unfulfilled}
      description={text.unfulfilled_hint}
      headline={
        <div className="flex flex-col gap-y-1">
          <Headline
            value={rate ?? text.no_rate}
            unit={rate ? text.unfulfilled_rate : undefined}
            isMuted={!rate}
          />
          <Text size="small" className="text-ui-fg-subtle tabular-nums">
            {unfulfilled.ended
              ? formatText(text.rate_line, {
                  unfulfilled: unfulfilled.unfulfilled,
                  ended: unfulfilled.ended,
                })
              : text.no_rate_line}
          </Text>
        </div>
      }
    >
      <dl className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
        {unfulfilled.groups.map(({ group, count }) => (
          <div key={group} className="flex flex-col">
            <dt>
              <Text size="small" className="text-ui-fg-subtle">
                {text[`group_${group}`]}
              </Text>
            </dt>
            <dd>
              <Text size="large" weight="plus" className="tabular-nums">
                {count}
              </Text>
            </dd>
          </div>
        ))}
        {/* Apart from the parties: these Orders have not ended. */}
        <div className="border-ui-border-base flex flex-col sm:ml-auto sm:border-l sm:pl-8">
          <dt>
            <Text size="small" className="text-ui-fg-subtle">
              {text.still_open_label}
            </Text>
          </dt>
          <dd className="flex items-baseline gap-x-1.5">
            <Text size="large" weight="plus" className="tabular-nums">
              {stillOpen}
            </Text>
            <Text size="xsmall" className="text-ui-fg-muted">
              {text.not_in_rate}
            </Text>
          </dd>
        </div>
      </dl>
      {/* Capped inside the padding, so the divider above stays full width
          and a count of 1 is not drawn across a whole desktop. */}
      {/* Takes any height the row gives the card, so the toggle stays at
          the bottom beside the stacked cards. */}
      <div className="flex-1 px-4 pb-2 pt-4 sm:px-6">
        <CountBars rows={rows} names="above" className="max-w-3xl" />
      </div>
      <ChartNumbers
        caption={formatText(text.unfulfilled_caption, {
          from: formatOperationsMoment(unfulfilled.period.starts_at, locale),
          to: formatOperationsMoment(unfulfilled.period.ends_at, locale),
          unfulfilled: unfulfilled.unfulfilled,
          ended: unfulfilled.ended,
          open: stillOpen,
        })}
        categoryHeader={text.cause}
        valueHeader={[text.unfulfilled_count]}
        rows={rows.map(({ key, label, count }) => ({
          key,
          label,
          values: [String(count)],
        }))}
        footer={[
          { label: text.total, value: [String(unfulfilled.unfulfilled)] },
        ]}
        {...numbersLabels(text)}
      />
    </Card>
  )
}
