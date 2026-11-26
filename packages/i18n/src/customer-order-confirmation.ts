import type { Locale } from "./locale.ts"

export const CUSTOMER_ORDER_CONFIRMATION_TEXT: Record<
  Locale,
  {
    title: string
    state: string
    explanation: string
    reference: string
    /** The next Order, from the same Restaurant's menu (#252). */
    orderAgain: string
  }
> = {
  da: {
    title: "Din ordre er modtaget",
    state: "Afventer Restaurantens accept",
    explanation:
      "Betalingen er gennemført. Restauranten skal nu acceptere din ordre.",
    reference: "Ordrenummer",
    orderAgain: "Bestil igen fra samme restaurant",
  },
  en: {
    title: "Your Order is placed",
    state: "Awaiting Restaurant acceptance",
    explanation:
      "Payment is complete. The Restaurant will now review your Order.",
    reference: "Order number",
    orderAgain: "Order again from this Restaurant",
  },
}
