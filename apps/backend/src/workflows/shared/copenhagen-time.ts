export const FINANCE_TIMEZONE = "Europe/Copenhagen"

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Whether a value is a real `YYYY-MM` calendar month. */
export const isCalendarMonth = (value: string) => MONTH_PATTERN.test(value)

export const copenhagenParts = (instant: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FINANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value)
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  }
}

/** The Copenhagen calendar month an instant falls in, as `YYYY-MM`. */
export function copenhagenMonthOf(instant: Date | string) {
  const { year, month } = copenhagenParts(new Date(instant))
  return `${year}-${String(month).padStart(2, "0")}`
}

/** The Copenhagen calendar date an instant falls on, as `YYYY-MM-DD`. */
export function copenhagenDateOf(instant: Date | string) {
  const { year, month, day } = copenhagenParts(new Date(instant))
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** The instant of Copenhagen midnight starting the given day. */
export function copenhagenMidnight(year: number, month: number, day = 1) {
  // Copenhagen changes its offset at 02:00/03:00 on a Sunday, never at
  // midnight, so the offset at a UTC guess for the same date is exact.
  const guess = Date.UTC(year, month - 1, day)
  const local = copenhagenParts(new Date(guess))
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  )
  return new Date(guess - (asUtc - guess))
}

/**
 * A month's period: from its Copenhagen start, inclusive, to the next
 * month's start, exclusive.
 */
export function copenhagenMonthPeriod(month: string) {
  const [year, number] = month.split("-").map(Number)
  return {
    starts_at: copenhagenMidnight(year, number),
    ends_at:
      number === 12
        ? copenhagenMidnight(year + 1, 1)
        : copenhagenMidnight(year, number + 1),
  }
}

/** Copenhagen's offset from UTC at an instant, in minutes (60 or 120). */
export function copenhagenOffsetMinutes(instant: Date) {
  const local = copenhagenParts(instant)
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  )
  return Math.round(
    (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000,
  )
}

/** Copenhagen's offset from UTC at an instant: `+01:00` or `+02:00`. */
export function copenhagenUtcOffset(instant: Date) {
  const hours = copenhagenOffsetMinutes(instant) / 60
  return `+${String(hours).padStart(2, "0")}:00`
}

/** The Copenhagen calendar date `days` after (or before) a `YYYY-MM-DD` date. */
export function addCopenhagenDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

/** The instant of Copenhagen midnight starting a `YYYY-MM-DD` date. */
export function copenhagenDayStart(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return copenhagenMidnight(year, month, day)
}
