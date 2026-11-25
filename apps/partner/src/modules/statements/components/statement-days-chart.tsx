import {
  formatExactDkk,
  formatStatementDate,
  formatStatementMonth,
  formatText,
  RESTAURANT_STATEMENTS_TEXT,
  type Locale,
} from "@dtc/i18n"
import { Container, Heading, Text, clx } from "@medusajs/ui"
import type { StatementDay } from "@lib/data/statements"

type Text = (typeof RESTAURANT_STATEMENTS_TEXT)["da"]

/** A clean axis top: 1, 1.5, 2, 2.5 or 5 times a power of ten, at or above `value`. */
const niceCeiling = (value: number) => {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 1.5, 2, 2.5, 5, 10].find(
    (factor) => value <= factor * power,
  )!
  return step * power
}

const participationText = (text: Text, day: StatementDay) =>
  ({
    active: text.day_active,
    inactive: text.day_inactive,
    unknown: text.day_unknown,
    not_reached: text.day_not_reached,
  })[day.participation]

/** Axis ticks are clean whole kroner (`1.500`); the intro names DKK. */
const WHOLE_DKK: Record<Locale, Intl.NumberFormat> = {
  da: new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }),
  en: new Intl.NumberFormat("en", { maximumFractionDigits: 0 }),
}

/** Day numbers on a phone: each week's first day, and today. */
const LABELLED_ON_PHONE = new Set([1, 8, 15, 22, 29])

/** Where a popup sits so it stays inside the chart at either edge. */
const anchorOf = (index: number, count: number) =>
  index < count / 3
    ? "left-0"
    : index >= (count * 2) / 3
      ? "right-0"
      : "left-1/2 -translate-x-1/2"

/**
 * The month day by day (#228): one column per Copenhagen date, its bar the
 * net of the entries booked that day, its marker whether the day counts for
 * the service fee. One series, so the heading names it and no legend box is
 * needed; the marker shapes are explained below the chart. Only the peak day
 * is labelled; hovering a day shows its details and the table view carries
 * every value, by keyboard too. It shows booked entries, never a substitute
 * for a withheld monthly total.
 */
export function StatementDaysChart({
  month,
  days,
  isWithheld,
  locale,
}: {
  month: string
  days: StatementDay[]
  /** The monthly totals are withheld: say the chart is entries only. */
  isWithheld: boolean
  locale: Locale
}) {
  const text = RESTAURANT_STATEMENTS_TEXT[locale]
  // Geometry only; every shown amount is formatted from its exact string.
  const nets = days.map(({ net }) => Math.max(0, Number(net)))
  const top = niceCeiling(Math.max(...nets))
  const peak = nets.indexOf(Math.max(...nets))
  const today = days.findLast(
    ({ participation }) => participation !== "not_reached",
  )?.date
  const height = (net: number) => `${(net / top) * 100}%`
  const columns = {
    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
  }
  const dayNumber = (day: StatementDay) => Number(day.date.slice(8))

  return (
    <Container
      aria-labelledby="statement-days"
      className="rounded-card flex flex-col gap-4 px-4 py-4 sm:px-6"
    >
      <div className="flex flex-col gap-1">
        <Heading level="h2" id="statement-days">
          {text.days_heading}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle max-w-prose">
          {text.days_intro}
        </Text>
        {isWithheld && (
          <Text size="small" className="max-w-prose">
            {text.days_withheld}
          </Text>
        )}
      </div>

      <figure
        className="flex flex-col gap-1"
        aria-label={formatText(text.days_chart_label, {
          month: formatStatementMonth(month, locale),
        })}
      >
        <div className="flex gap-2">
          {/* The axis: its clean top and zero, in muted text. */}
          <div
            aria-hidden="true"
            className="txt-compact-xsmall text-ui-fg-muted flex h-44 w-10 shrink-0 flex-col justify-between pb-0 pt-5 text-right tabular-nums sm:w-16"
          >
            <span className="-translate-y-1/2">
              {WHOLE_DKK[locale].format(top)}
            </span>
            <span className="translate-y-1/2">0</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-44 pt-5">
              {/* Recessive hairline gridlines at the top and the middle. */}
              <div
                aria-hidden="true"
                className="border-ui-border-base pointer-events-none absolute inset-x-0 top-5 border-t"
              />
              <div
                aria-hidden="true"
                className="border-ui-border-base pointer-events-none absolute inset-x-0 top-[calc(50%+0.625rem)] border-t"
              />
              <ol
                className="border-ui-border-strong relative grid h-full items-end gap-[2px] border-b"
                style={columns}
              >
                {days.map((day, index) => (
                  <li
                    key={day.date}
                    className={clx(
                      "group relative flex h-full items-end justify-center rounded-t-[4px]",
                      day.participation === "active" &&
                        "bg-mtogo-surface-selected",
                    )}
                  >
                    <span className="sr-only">
                      {formatStatementDate(day.date, locale)}:{" "}
                      {participationText(text, day)},{" "}
                      {formatText(text.day_orders, { count: day.orders })},{" "}
                      {text.entry_net} {formatExactDkk(day.net, locale)}
                    </span>
                    {nets[index] > 0 && (
                      <span
                        aria-hidden="true"
                        className="bg-mtogo-action-primary w-[70%] max-w-6 rounded-t-[4px]"
                        style={{ height: height(nets[index]) }}
                      />
                    )}
                    {index === peak && nets[index] > 0 && (
                      <span
                        aria-hidden="true"
                        className={clx(
                          "txt-compact-xsmall-plus text-ui-fg-base absolute hidden whitespace-nowrap tabular-nums sm:block",
                          anchorOf(index, days.length),
                        )}
                        style={{
                          bottom: `calc(${height(nets[index])} + 0.25rem)`,
                        }}
                      >
                        {formatExactDkk(day.net, locale)}
                      </span>
                    )}
                    {/* Hover details; the table view carries them by keyboard. */}
                    <span
                      aria-hidden="true"
                      className={clx(
                        "bg-ui-bg-base shadow-elevation-tooltip txt-compact-xsmall text-ui-fg-base pointer-events-none absolute bottom-full z-10 mb-1 hidden flex-col gap-0.5 whitespace-nowrap rounded-md px-2 py-1.5 group-hover:flex",
                        anchorOf(index, days.length),
                      )}
                    >
                      <span className="txt-compact-xsmall-plus">
                        {formatStatementDate(day.date, locale)}
                        {day.date === today && ` · ${text.day_today}`}
                      </span>
                      <span className="text-ui-fg-subtle">
                        {participationText(text, day)}
                      </span>
                      {day.participation !== "not_reached" && (
                        <span className="tabular-nums">
                          {formatText(text.day_orders, { count: day.orders })}
                          {" · "}
                          {text.entry_net} {formatExactDkk(day.net, locale)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {/* Participation markers: a dot for active, a ring for unknown. */}
            <div
              aria-hidden="true"
              className="mt-1.5 grid h-2 gap-[2px]"
              style={columns}
            >
              {days.map((day) => (
                <span key={day.date} className="flex justify-center">
                  {day.participation === "active" && (
                    <span className="bg-mtogo-action-primary size-2 rounded-full" />
                  )}
                  {day.participation === "unknown" && (
                    <span className="border-ui-fg-subtle size-2 rounded-full border" />
                  )}
                </span>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="txt-compact-xsmall mt-1 grid gap-[2px] tabular-nums"
              style={columns}
            >
              {days.map((day) => (
                <span
                  key={day.date}
                  className={clx(
                    // Narrow columns: the number may spill into its neighbours.
                    "flex justify-center whitespace-nowrap",
                    day.participation === "not_reached"
                      ? "text-ui-fg-disabled"
                      : "text-ui-fg-muted",
                    day.date === today && "text-ui-fg-base font-medium",
                    !LABELLED_ON_PHONE.has(dayNumber(day)) &&
                      day.date !== today &&
                      "invisible sm:visible",
                  )}
                >
                  {dayNumber(day)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="txt-compact-xsmall text-ui-fg-subtle ml-12 mt-2 flex flex-wrap gap-x-4 gap-y-1"
        >
          <span className="flex items-center gap-1.5">
            <span className="bg-mtogo-action-primary size-2 rounded-full" />
            {text.day_active}
          </span>
          {days.some(({ participation }) => participation === "unknown") && (
            <span className="flex items-center gap-1.5">
              <span className="border-ui-fg-subtle size-2 rounded-full border" />
              {text.day_unknown}
            </span>
          )}
        </div>
      </figure>

      <details className="group/table">
        <summary className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:ring-mtogo-focus-ring txt-compact-small-plus w-fit cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2">
          {text.days_show_table}
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="txt-compact-small w-full min-w-[32rem] tabular-nums">
            <thead>
              <tr className="txt-compact-small-plus text-ui-fg-subtle text-left">
                <th scope="col" className="py-2 pr-3">
                  {text.days_date}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {text.days_participation}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {text.entry_order}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {text.entry_food_credit}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {text.entry_commission}
                </th>
                <th scope="col" className="py-2 text-right">
                  {text.entry_net}
                </th>
              </tr>
            </thead>
            <tbody className="divide-ui-border-base divide-y">
              {days
                .filter(({ participation }) => participation !== "not_reached")
                .map((day) => (
                  <tr key={day.date}>
                    <th
                      scope="row"
                      className="py-1.5 pr-3 text-left font-normal"
                    >
                      {formatStatementDate(day.date, locale)}
                    </th>
                    <td className="text-ui-fg-subtle py-1.5 pr-3">
                      {participationText(text, day)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{day.orders}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {formatExactDkk(day.food_credit, locale)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {formatExactDkk(day.commission, locale)}
                    </td>
                    <td className="py-1.5 text-right">
                      {formatExactDkk(day.net, locale)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </Container>
  )
}
