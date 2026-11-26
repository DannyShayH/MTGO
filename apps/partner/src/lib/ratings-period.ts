/**
 * The Ratings page address (#249): one of the backend's statistics periods.
 * The last 30 days is the default, and an unknown value falls back to it.
 */

export const RATINGS_PERIODS = [
  "last_30_days",
  "previous_month",
  "all_time",
] as const

export type RatingsPeriod = (typeof RATINGS_PERIODS)[number]

export function parseRatingsPeriod(
  params: Record<string, string | string[] | undefined>,
): RatingsPeriod {
  const period = params.period
  return RATINGS_PERIODS.find((key) => key === period) ?? "last_30_days"
}

export const ratingsHref = (period: RatingsPeriod) =>
  period === "last_30_days" ? "/ratings" : `/ratings?period=${period}`
