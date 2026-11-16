import type { Locale } from "./locale.ts"
import { CHECKOUT_REVIEW_METADATA_KEY } from "./checkout.ts"

export const CUSTOMER_CHECKOUT_TEXT: Record<
  Locale,
  {
    apartment: string
    orderLanguage: string
    contact: string
    payment: string
    paymentMethod: string
    paymentDetails: string
    shippingAddress: string
    billingAddress: string
    billingSameAsDelivery: string
    backToCart: string
    back: string
    enterPaymentDetails: string
    anotherStepFollows: string
    continueToReview: string
    review: string
    reviewNote: string
    placeOrder: string
    selectPayment: string
    delivery: string
    deliveryIncluded: string
    continueToPayment: string
    edit: string
    basketSummary: string
    total: string
    orderNotPlaced: string
    deliveryUnavailable: string
    deliverySelectionFailed: string
    errors: Record<string, string>
  }
> = {
  da: {
    apartment: "Lejlighed eller etage",
    orderLanguage: "Bestillingssprog",
    contact: "Kontakt",
    payment: "Betaling",
    paymentMethod: "Betalingsmåde",
    paymentDetails: "Betalingsoplysninger",
    shippingAddress: "Leveringsadresse",
    billingAddress: "Faktureringsadresse",
    billingSameAsDelivery:
      "Faktureringsadresse og leveringsadresse er den samme.",
    backToCart: "Tilbage til kurven",
    back: "Tilbage",
    enterPaymentDetails: "Indtast betalingsoplysninger",
    anotherStepFollows: "Endnu et trin følger",
    continueToReview: "Fortsæt til oversigt",
    review: "Gennemse bestilling",
    reviewNote:
      "Kontrollér mad, leveringsadresse og samlet pris, før du betaler.",
    placeOrder: "Betal og bestil",
    selectPayment: "Vælg en betalingsmåde",
    delivery: "Levering",
    deliveryIncluded: "Levering er inkluderet",
    continueToPayment: "Fortsæt til betaling",
    edit: "Rediger",
    basketSummary: "Din kurv",
    total: "I alt",
    orderNotPlaced:
      "Bestillingen blev ikke gennemført. Din kurv er gemt. Prøv igen.",
    deliveryUnavailable: "Levering er ikke tilgængelig lige nu.",
    deliverySelectionFailed: "Levering kunne ikke vælges. Prøv igen.",
    errors: {
      checkout_customer_required:
        "Log ind og bekræft din e-mail for at fortsætte.",
      customer_language_invalid:
        "Vælg dansk eller engelsk som bestillingssprog.",
      checkout_cart_not_owned:
        "Kurven tilhører ikke din konto. Hent kurven igen.",
      checkout_review_incomplete:
        "Udfyld alle påkrævede leverings- og kontaktoplysninger.",
      customer_address_phone_invalid:
        "Indtast et gyldigt mobilnummer med landekode.",
    },
  },
  en: {
    apartment: "Apartment or floor",
    orderLanguage: "Order language",
    contact: "Contact",
    payment: "Payment",
    paymentMethod: "Payment method",
    paymentDetails: "Payment details",
    shippingAddress: "Shipping address",
    billingAddress: "Billing address",
    billingSameAsDelivery: "Billing and delivery address are the same.",
    backToCart: "Back to shopping cart",
    back: "Back",
    enterPaymentDetails: "Enter payment details",
    anotherStepFollows: "Another step will appear",
    continueToReview: "Continue to review",
    review: "Review Order",
    reviewNote: "Check the food, delivery address and total before paying.",
    placeOrder: "Pay and place Order",
    selectPayment: "Select a payment method",
    delivery: "Delivery",
    deliveryIncluded: "Delivery included",
    continueToPayment: "Continue to payment",
    edit: "Edit",
    basketSummary: "Your basket",
    total: "Total",
    orderNotPlaced:
      "The Order was not placed. Your basket is saved. Please try again.",
    deliveryUnavailable: "Delivery is unavailable right now.",
    deliverySelectionFailed: "Delivery could not be selected. Try again.",
    errors: {
      checkout_customer_required:
        "Sign in and verify your email before continuing.",
      customer_language_invalid:
        "Choose Danish or English as the Order language.",
      checkout_cart_not_owned:
        "This basket does not belong to your account. Reload it.",
      checkout_review_incomplete:
        "Complete all required delivery and contact details.",
      customer_address_phone_invalid:
        "Enter a valid mobile number with a country code.",
    },
  },
}

export const reviewedCheckoutLanguage = (
  metadata: Record<string, unknown> | null | undefined,
): Locale | undefined => {
  const value = (
    metadata?.[CHECKOUT_REVIEW_METADATA_KEY] as
      { order_language?: unknown } | undefined
  )?.order_language
  return value === "da" || value === "en" ? value : undefined
}

export const customerCheckoutErrorMessage = (
  error: string | null,
  locale: Locale,
) =>
  CUSTOMER_CHECKOUT_TEXT[locale].errors[error ?? ""] ??
  CUSTOMER_CHECKOUT_TEXT[locale].errors.checkout_review_incomplete
