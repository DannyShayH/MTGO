import type { Locale } from "./locale.ts"
import { CHECKOUT_REVIEW_METADATA_KEY } from "./checkout.ts"

export const CUSTOMER_CHECKOUT_TEXT: Record<
  Locale,
  {
    apartment: string
    orderLanguage: string
    contact: string
    errors: Record<string, string>
  }
> = {
  da: {
    apartment: "Lejlighed eller etage",
    orderLanguage: "Bestillingssprog",
    contact: "Kontakt",
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
