import type { StripeError } from "@stripe/stripe-js"

const GENERIC_PAYMENT_ERROR =
  "We couldn't process your payment. Please try again or use a different payment method."

// This helper runs in Client Components. Browser output is not an application
// log, and Stripe objects/messages can carry payment and personal details.
export const getPaymentErrorMessage = (error?: Partial<StripeError> | null) => {
  return error ? GENERIC_PAYMENT_ERROR : null
}
