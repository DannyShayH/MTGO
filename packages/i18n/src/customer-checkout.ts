import type { Locale } from "./locale.ts"
import { CHECKOUT_REVIEW_METADATA_KEY } from "./checkout.ts"

export const CUSTOMER_CHECKOUT_TEXT: Record<
  Locale,
  {
    savedAddresses: string
    chooseAddress: string
    country: string
    email: string
    emailInvalid: string
    requiredField: string
    apartment: string
    orderLanguage: string
    contact: string
    payment: string
    paymentMethod: string
    paymentDetails: string
    testPaymentNotice: string
    testCardNumber: string
    testExpiry: string
    testSecurityCode: string
    testCardInvalid: string
    testCardNumberError: string
    testExpiryError: string
    testCodeError: string
    fillTestCard: string
    testPaymentSummary: string
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
    savedAddresses:
      "Vælg en gemt leveringsadresse, eller indtast en ny nedenfor.",
    chooseAddress: "Vælg en adresse",
    country: "Land",
    email: "E-mail",
    emailInvalid: "Indtast en gyldig e-mailadresse.",
    requiredField: "Udfyld dette felt.",
    apartment: "Lejlighed eller etage",
    orderLanguage: "Bestillingssprog",
    contact: "Kontakt",
    payment: "Betaling",
    paymentMethod: "Betalingsmåde",
    paymentDetails: "Betalingsoplysninger",
    testPaymentNotice:
      "Testbetaling – ingen penge trækkes. Brug kun testkortet 4242 4242 4242 4242, en fremtidig dato og en valgfri trecifret kode. Indtast ikke et rigtigt kort.",
    testCardNumber: "Testkortnummer",
    testExpiry: "Udløb (MM/ÅÅ)",
    testSecurityCode: "Sikkerhedskode",
    testCardNumberError: "Brug testkortnummeret 4242 4242 4242 4242.",
    testExpiryError:
      "Indtast en gyldig udløbsdato som MM/ÅÅ. Kortet er udløbet, hvis datoen er i fortiden.",
    testCodeError: "Indtast en trecifret sikkerhedskode, for eksempel 123.",
    fillTestCard: "Udfyld testkort",
    testCardInvalid:
      "Kontrollér testkortnummeret, udløbsdatoen og den trecifrede kode.",
    testPaymentSummary: "Testbetaling – ingen penge trækkes",
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
    savedAddresses:
      "Choose a saved delivery address, or enter a new one below.",
    chooseAddress: "Choose an address",
    country: "Country",
    email: "Email",
    emailInvalid: "Enter a valid email address.",
    requiredField: "Complete this field.",
    apartment: "Apartment or floor",
    orderLanguage: "Order language",
    contact: "Contact",
    payment: "Payment",
    paymentMethod: "Payment method",
    paymentDetails: "Payment details",
    testPaymentNotice:
      "Test payment – no money will be charged. Use only test card 4242 4242 4242 4242, a future date and any three-digit code. Do not enter a real card.",
    testCardNumber: "Test card number",
    testExpiry: "Expiry (MM/YY)",
    testSecurityCode: "Security code",
    testCardNumberError: "Use the test card number 4242 4242 4242 4242.",
    testExpiryError:
      "Enter a valid expiry as MM/YY. The card has expired if the date is in the past.",
    testCodeError: "Enter a three-digit security code, for example 123.",
    fillTestCard: "Fill in test card",
    testCardInvalid:
      "Check the test card number, expiry date and three-digit code.",
    testPaymentSummary: "Test payment – no money will be charged",
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
