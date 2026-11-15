import type { Locale } from "./locale.ts"

export const CHECKOUT_REVIEW_VERSION = 1 as const
export const CHECKOUT_REVIEW_METADATA_KEY = "mtogo_checkout_review" as const

export type ReviewedCheckoutAddress = {
  first_name: string
  last_name: string
  company: string
  address_1: string
  address_2: string
  postal_code: string
  city: string
  province: string
  country_code: string
  phone: string
}

export type ReviewedCheckout = {
  version: typeof CHECKOUT_REVIEW_VERSION
  customer_id: string
  destination: ReviewedCheckoutAddress
  contact: {
    first_name: string
    last_name: string
    phone: string
    email: string
  }
  order_language: Locale
  reviewed_at: string
}

export type ReviewedCheckoutInput = Omit<
  ReviewedCheckout,
  "version" | "reviewed_at"
>

export type ReviewedCheckoutCartFacts = {
  customer_id: string | null
  email: string | null
  shipping_address: ReviewedCheckoutAddress | null
}

/** The immutable facts Feature #46 must copy when it places an Order. */
export const createReviewedCheckout = (
  input: ReviewedCheckoutInput,
  reviewedAt: string,
): ReviewedCheckout => ({
  ...input,
  version: CHECKOUT_REVIEW_VERSION,
  reviewed_at: reviewedAt,
  destination: { ...input.destination },
  contact: { ...input.contact },
})

export const reviewedCheckoutIsComplete = (review: ReviewedCheckout) =>
  Boolean(
    review.version === CHECKOUT_REVIEW_VERSION &&
    review.customer_id &&
    review.destination.first_name &&
    review.destination.last_name &&
    review.destination.address_1 &&
    review.destination.postal_code &&
    review.destination.city &&
    review.destination.country_code &&
    review.destination.phone &&
    review.contact.first_name &&
    review.contact.last_name &&
    review.contact.phone &&
    review.contact.email &&
    review.order_language,
  )

export const isReviewedCheckout = (
  value: unknown,
): value is ReviewedCheckout => {
  if (!value || typeof value !== "object") return false

  const review = value as Partial<ReviewedCheckout>
  const destination = review.destination
  const contact = review.contact

  if (!destination || typeof destination !== "object") return false
  if (!contact || typeof contact !== "object") return false

  return (
    typeof review.version === "number" &&
    typeof review.customer_id === "string" &&
    typeof review.order_language === "string" &&
    typeof review.reviewed_at === "string" &&
    Object.values(destination).every((item) => typeof item === "string") &&
    Object.values(contact).every((item) => typeof item === "string") &&
    reviewedCheckoutIsComplete(review as ReviewedCheckout)
  )
}

export const reviewedCheckoutMatchesCart = (
  review: ReviewedCheckout,
  cart: ReviewedCheckoutCartFacts,
) =>
  reviewedCheckoutIsComplete(review) &&
  review.customer_id === cart.customer_id &&
  review.contact.email === cart.email &&
  !!cart.shipping_address &&
  (
    Object.keys(review.destination) as Array<keyof ReviewedCheckoutAddress>
  ).every(
    (key) =>
      normalizeAddressValue(review.destination[key]) ===
      normalizeAddressValue(cart.shipping_address?.[key]),
  )

const normalizeAddressValue = (value: unknown) =>
  value == null ? "" : String(value)
