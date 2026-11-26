import { formatText } from "./format.ts"
import type { Locale } from "./locale.ts"

/**
 * The Restaurant's own food rating in the partner app (#249): what Customers
 * gave the food, by period and per delivered Order. Only the food rating, never
 * who gave it. Missing Feedback is unrated, never zero (ADR-0010).
 */
export const RESTAURANT_RATINGS_TEXT = {
  da: {
    title: "Bedømmelser",
    intro:
      "Sådan bedømmer kunderne jeres mad fra 1 til 5 stjerner. Bedømmelserne tælles på det tidspunkt, ordren blev leveret.",
    period: "Periode",
    period_last_30_days: "Seneste 30 dage",
    period_previous_month: "Forrige måned",
    period_all_time: "Hele perioden",
    food_rating: "Madbedømmelse",
    average: "{average} ud af 5",
    no_ratings: "Ingen bedømmelser endnu",
    no_ratings_hint:
      "Ingen kunder har bedømt maden i perioden. En ordre uden bedømmelse tæller ikke som 0.",
    ratings_count: "Bedømmelser",
    delivered_orders: "Leverede ordrer",
    distribution: "Fordeling",
    stars: "{stars} stjerner",
    star: "1 stjerne",
    distribution_row: "{stars}: {count} bedømmelser",
    read_only:
      "Bedømmelserne kan ikke besvares eller skjules. Kunderne vises ikke.",
    order_rating: "Madbedømmelse: {rating} ud af 5",
    order_not_rated: "Madbedømmelse: Ikke bedømt",
    unavailable_title: "Bedømmelserne kunne ikke hentes",
    retry_hint: "Prøv igen om lidt.",
    retry: "Prøv igen",
    loading: "Henter bedømmelser",
  },
  en: {
    title: "Ratings",
    intro:
      "How Customers rate your food from 1 to 5 stars. Ratings count from the time the Order was delivered.",
    period: "Period",
    period_last_30_days: "Last 30 days",
    period_previous_month: "Previous month",
    period_all_time: "All time",
    food_rating: "Food rating",
    average: "{average} of 5",
    no_ratings: "No ratings yet",
    no_ratings_hint:
      "No Customer has rated the food in this period. An Order without a rating never counts as 0.",
    ratings_count: "Ratings",
    delivered_orders: "Delivered Orders",
    distribution: "Distribution",
    stars: "{stars} stars",
    star: "1 star",
    distribution_row: "{stars}: {count} ratings",
    read_only: "Ratings cannot be answered or hidden. Customers are not shown.",
    order_rating: "Food rating: {rating} of 5",
    order_not_rated: "Food rating: Not rated",
    unavailable_title: "Ratings could not be loaded",
    retry_hint: "Try again in a moment.",
    retry: "Try again",
    loading: "Loading ratings",
  },
} as const

/** A one-decimal average in the locale's number format: "4,3 ud af 5". */
export function formatFoodRatingAverage(average: number, locale: Locale) {
  const value = new Intl.NumberFormat(locale === "da" ? "da-DK" : "en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average)
  return formatText(RESTAURANT_RATINGS_TEXT[locale].average, {
    average: value,
  })
}

/** "1 star" or "4 stars". */
export function starsLabel(stars: number, locale: Locale) {
  const text = RESTAURANT_RATINGS_TEXT[locale]
  return stars === 1
    ? text.star
    : formatText(text.stars, { stars: String(stars) })
}
