import type { Locale } from "./locale.ts"

export const CUSTOMER_ORDER_CONFIRMATION_TEXT: Record<
  Locale,
  { title: string; state: string; explanation: string; reference: string }
> = {
  da: {
    title: "Din bestilling er modtaget",
    state: "Afventer Restaurantens accept",
    explanation:
      "Betalingen er gennemført. Restauranten skal nu acceptere din bestilling.",
    reference: "Ordrenummer",
  },
  en: {
    title: "Your Order is placed",
    state: "Awaiting Restaurant acceptance",
    explanation:
      "Payment is complete. The Restaurant will now review your Order.",
    reference: "Order number",
  },
}
