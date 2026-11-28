import { formatText } from "./format.ts"
import type { Locale } from "./locale.ts"

/**
 * The Restaurant's own operations in the partner app (#264): the staff
 * subset of the operator's Operations page, with the same definitions.
 * Never Full refunds, attention items, Delivery transit time or the
 * platform's Customer rating; the food rating stays on the Ratings page.
 * "Failed" names only the delivery outcome (GLOSSARY: Unfulfilled Order).
 */
export const RESTAURANT_OPERATIONS_TEXT = {
  da: {
    title: "Drift",
    intro:
      "Sådan går det i jeres restaurant lige nu, de seneste 24 timer og de forrige 7 dage. Tallene beregnes, som MTOGO beregner dem.",
    calculated_at: "Beregnet",
    calculated_note: "Siden opdaterer ikke af sig selv.",
    refresh: "Opdater",
    refreshing: "Opdaterer…",
    now: "Lige nu",
    last_24_hours: "Seneste 24 timer",
    previous_7_days: "Forrige 7 dage",
    complete_days: "hele dage",
    open_orders: "Åbne ordrer efter trin",
    open_orders_hint: "Ikke annulleret og endnu ikke afleveret.",
    open_count: "åbne",
    stage: "Trin",
    stage_awaiting_acceptance: "Venter på accept",
    stage_accepted_or_preparing: "Accepteret eller under tilberedning",
    stage_ready_unassigned: "Klar, intet bud",
    stage_assigned_not_picked_up: "Bud tildelt, ikke afhentet",
    stage_picked_up: "Afhentet, ikke afleveret",
    total: "I alt",
    open_orders_caption:
      "Åbne ordrer efter trin {time} (dansk tid), i alt {total}",
    placements: "Afgivne ordrer",
    placements_hint: "Annullerede ordrer er talt med.",
    placed_count: "afgivet",
    cancelled: "Heraf annulleret",
    category_restaurant_rejected: "Afvist af jer",
    category_acceptance_timeout: "Ikke accepteret i tide",
    category_customer_cancelled: "Annulleret af kunden",
    category_unassigned_timeout: "Intet bud fundet",
    category_operator_cancelled: "Annulleret af MTOGO",
    category_delivery_failed: "Levering mislykkedes",
    orders_per_hour: "Ordrer pr. time",
    orders_per_hour_hint: "Hver time fra kl. {from}, dansk tid.",
    orders_per_hour_caption:
      "Afgivne ordrer pr. time fra {from} til {to} (dansk tid)",
    hour: "Time",
    so_far: "indtil nu",
    peak: "flest kl. {hour}",
    no_orders: "Ingen ordrer",
    current_hour_key: "Indeværende time, indtil nu",
    hour_key: "Afgivne ordrer",
    placements_per_day: "Afgivne ordrer pr. dag",
    placements_per_day_hint: "Hver dag, dansk tid.",
    placements_per_day_caption:
      "Afgivne ordrer pr. dag fra {first} til {last}, med gennemsnittet for 7 dage",
    day: "Dag",
    average_per_day: "om dagen i gennemsnit",
    average_key: "Gennemsnit for 7 dage",
    day_key: "Afgivne ordrer",
    average: "Gennemsnit",
    orders: "Ordrer",
    processing_time: "Ordrebehandlingstid",
    processing_time_hint:
      "Fra ordren blev afgivet, til maden blev afleveret, for ordrer afleveret de seneste 24 timer.",
    no_average: "Intet gennemsnit",
    included_one: "1 ordre talt med",
    included_many: "{count} ordrer talt med",
    none_excluded: "Ingen udeladt",
    excluded: "{count} udeladt: {reasons}",
    reason_no_placement_time: "intet afgivelsestidspunkt",
    reason_no_handover_time: "intet afleveringstidspunkt",
    change_none: "Ingen forrige 7 dage at sammenligne med",
    change_same: "Som gennemsnittet for 7 dage på {previous}",
    change_faster:
      "{percent} % hurtigere end gennemsnittet for 7 dage på {previous}",
    change_slower:
      "{percent} % langsommere end gennemsnittet for 7 dage på {previous}",
    processing_per_day_caption:
      "Gennemsnitlig ordrebehandlingstid pr. dag fra {first} til {last}, med antal ordrer",
    show_numbers: "Vis tallene",
    hide_numbers: "Skjul tallene",
    unfulfilled: "Ikke-gennemførte ordrer efter årsag",
    unfulfilled_hint:
      "Ordrer afgivet de seneste 24 timer, der sluttede uden at maden blev afleveret.",
    unfulfilled_rate: "ikke gennemført",
    no_rate: "Ingen andel",
    rate_line: "{unfulfilled} af {ended} afsluttede ordrer",
    no_rate_line: "Ingen af ordrerne er afsluttet endnu",
    still_open_label: "Stadig åbne",
    not_in_rate: "ikke i andelen",
    unfulfilled_count: "Ikke-gennemførte",
    on_average: "i gennemsnit",
    cause: "Årsag",
    group_customer: "Kunden",
    group_restaurant: "Restauranten",
    group_mtogo: "MTOGO",
    unfulfilled_caption:
      "Ikke-gennemførte ordrer efter årsag blandt ordrer afgivet fra {from} til {to} (dansk tid): {unfulfilled} af {ended} afsluttede, {open} stadig åbne og ikke talt med",
    ratings_link: "Se jeres madbedømmelse under Bedømmelser",
    unavailable_title: "Driften kunne ikke hentes",
    retry_hint: "Prøv igen om lidt.",
    retry: "Prøv igen",
    loading: "Henter driften",
  },
  en: {
    title: "Operations",
    intro:
      "How your Restaurant is doing right now, over the last 24 hours and the previous 7 days, calculated the way MTOGO calculates it.",
    calculated_at: "Calculated",
    calculated_note: "The page does not update on its own.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    now: "Right now",
    last_24_hours: "Last 24 hours",
    previous_7_days: "Previous 7 days",
    complete_days: "complete days",
    open_orders: "Open Orders by stage",
    open_orders_hint: "Not cancelled and not yet handed over.",
    open_count: "open",
    stage: "Stage",
    stage_awaiting_acceptance: "Awaiting acceptance",
    stage_accepted_or_preparing: "Accepted or preparing",
    stage_ready_unassigned: "Ready, no Delivery agent",
    stage_assigned_not_picked_up: "Agent assigned, not picked up",
    stage_picked_up: "Picked up, not handed over",
    total: "Total",
    open_orders_caption:
      "Open Orders by stage at {time} (Copenhagen time), total {total}",
    placements: "Orders placed",
    placements_hint: "Cancelled Orders included.",
    placed_count: "placed",
    cancelled: "Of these, cancelled",
    category_restaurant_rejected: "Rejected by you",
    category_acceptance_timeout: "Not accepted in time",
    category_customer_cancelled: "Cancelled by the Customer",
    category_unassigned_timeout: "No Delivery agent found",
    category_operator_cancelled: "Cancelled by MTOGO",
    category_delivery_failed: "Delivery failed",
    orders_per_hour: "Orders per hour",
    orders_per_hour_hint: "Each hour from {from}, Copenhagen time.",
    orders_per_hour_caption:
      "Orders placed per hour from {from} to {to} (Copenhagen time)",
    hour: "Hour",
    so_far: "so far",
    peak: "peak at {hour}",
    no_orders: "No Orders",
    current_hour_key: "Current hour, so far",
    hour_key: "Orders placed",
    placements_per_day: "Placements per day",
    placements_per_day_hint: "Each Copenhagen day.",
    placements_per_day_caption:
      "Orders placed per day from {first} to {last}, with the seven-day average",
    day: "Day",
    average_per_day: "a day on average",
    average_key: "7-day average",
    day_key: "Orders placed",
    average: "Average",
    orders: "Orders",
    processing_time: "Order processing time",
    processing_time_hint:
      "From placement to handover, for Orders handed over in the last 24 hours.",
    no_average: "No average",
    included_one: "1 Order included",
    included_many: "{count} Orders included",
    none_excluded: "None excluded",
    excluded: "{count} excluded: {reasons}",
    reason_no_placement_time: "no placement time",
    reason_no_handover_time: "no handover time",
    change_none: "No previous 7 days to compare with",
    change_same: "Same as the 7-day average of {previous}",
    change_faster: "{percent}% faster than the 7-day average of {previous}",
    change_slower: "{percent}% slower than the 7-day average of {previous}",
    processing_per_day_caption:
      "Average Order processing time per day from {first} to {last}, with the Orders included",
    show_numbers: "Show the numbers",
    hide_numbers: "Hide the numbers",
    unfulfilled: "Unfulfilled Orders by cause",
    unfulfilled_hint:
      "Orders placed in the last 24 hours that ended without the food handed over.",
    unfulfilled_rate: "unfulfilled",
    no_rate: "No rate",
    rate_line: "{unfulfilled} of {ended} ended Orders",
    no_rate_line: "None of the Orders has ended yet",
    still_open_label: "Still open",
    not_in_rate: "not in the rate",
    unfulfilled_count: "Unfulfilled Orders",
    on_average: "on average",
    cause: "Cause",
    group_customer: "Customer",
    group_restaurant: "Restaurant",
    group_mtogo: "MTOGO",
    unfulfilled_caption:
      "Unfulfilled Orders by cause among the Orders placed from {from} to {to} (Copenhagen time): {unfulfilled} of {ended} ended, {open} still open and not counted",
    ratings_link: "See your food rating on Ratings",
    unavailable_title: "Operations could not be loaded",
    retry_hint: "Try again in a moment.",
    retry: "Try again",
    loading: "Loading operations",
  },
} as const

type OperationsText = (typeof RESTAURANT_OPERATIONS_TEXT)[Locale]

const intlLocale = (locale: Locale) => (locale === "da" ? "da-DK" : "en-GB")

/**
 * A time to the whole minute as people say it: "53 min", "2 t 3 min" or
 * "2 h". Null when there is no average: no Order included is never zero.
 */
export function formatOperationsDuration(
  seconds: number | null,
  locale: Locale,
) {
  if (seconds === null) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hour = locale === "da" ? "t" : "h"
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} ${hour} ${rest} min` : `${hours} ${hour}`
}

/** A rate to at most one decimal: "10 %" / "10%", "66,7 %" / "66.7%". */
export function formatOperationsRate(percent: number | null, locale: Locale) {
  if (percent === null) return null
  const value = percent.toLocaleString(intlLocale(locale), {
    maximumFractionDigits: 1,
  })
  return locale === "da" ? `${value} %` : `${value}%`
}

/** A seven-day average to one decimal in the locale's format. */
export function formatOperationsAverage(value: number, locale: Locale) {
  return value.toLocaleString(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** A Copenhagen date as a weekday and day: "lør. 21. nov." / "Sat 21 Nov". */
export function formatOperationsDay(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`))
}

/** A period's edge in Copenhagen time, to the minute. */
export function formatOperationsMoment(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

/** The calculation moment in Copenhagen time, to the second. */
export function formatOperationsCalculatedAt(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value))
}

/**
 * Each hour's name: the Copenhagen clock time, with the UTC offset when that
 * time occurs twice (the night the clocks go back) and "so far" for the
 * current hour.
 */
export function operationsHourLabels(
  hours: { local_time: string; utc_offset: string; is_current: boolean }[],
  locale: Locale,
) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  return hours.map(({ local_time, utc_offset, is_current }) => {
    const isRepeated =
      hours.filter((other) => other.local_time === local_time).length > 1
    const notes = [isRepeated && utc_offset, is_current && text.so_far].filter(
      Boolean,
    )
    return notes.length ? `${local_time} (${notes.join(", ")})` : local_time
  })
}

/**
 * The last 24 hours against the previous seven days, in words: a shorter
 * time is faster. The words carry the meaning, never a colour alone.
 */
export function operationsChangeText(
  percent: number | null,
  previousSeconds: number | null,
  locale: Locale,
) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  const previous = formatOperationsDuration(previousSeconds, locale)
  if (percent === null || previous === null) return text.change_none
  if (percent === 0) return formatText(text.change_same, { previous })
  return formatText(percent < 0 ? text.change_faster : text.change_slower, {
    percent: Math.abs(percent),
    previous,
  })
}

/** "1 Order included" or "3 Orders included". */
export function operationsIncludedText(count: number, locale: Locale) {
  const text = RESTAURANT_OPERATIONS_TEXT[locale]
  return count === 1
    ? text.included_one
    : formatText(text.included_many, { count })
}

/**
 * The Orders a time measure left out, as one line, largest reason first:
 * "1 excluded: no placement time" or "None excluded".
 */
export function operationsExclusionText(
  exclusions: {
    reason: "no_placement_time" | "no_handover_time"
    count: number
  }[],
  locale: Locale,
) {
  const text: OperationsText = RESTAURANT_OPERATIONS_TEXT[locale]
  const present = exclusions
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
  const total = present.reduce((sum, { count }) => sum + count, 0)
  if (total === 0) return text.none_excluded
  const reasons =
    present.length === 1
      ? text[`reason_${present[0].reason}`]
      : present
          .map(({ reason, count }) => `${count} ${text[`reason_${reason}`]}`)
          .join(", ")
  return formatText(text.excluded, { count: total, reasons })
}
