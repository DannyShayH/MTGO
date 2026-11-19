export const CUSTOMER_ORDER_DETAIL_TEXT = {
  da: {
    title: "Ordredetaljer",
    back: "Tilbage til ordrer",
    date: "Bestilt",
    items: "Varer",
    delivery: "Levering",
    contact: "Kontakt",
    total: "I alt",
    cancellation: "Annulleret ordre",
    cancelled_restaurant_rejected:
      "Restauranten kunne ikke lave din ordre og annullerede den {time}.",
    cancelled_acceptance_timeout:
      "Restauranten nåede ikke at acceptere din ordre inden fristen {time}, så den blev annulleret.",
    cancelled_customer_cancelled: "Du annullerede ordren {time}.",
    refund_pending: "Vi er ved at refundere {amount}. Det kan tage et øjeblik.",
    refund_failed:
      "Refusionen af {amount} er ikke gået igennem endnu. Du får stadig pengene tilbage, og MTOGO følger op.",
    refund_succeeded: "{amount} er refunderet til din betalingsmetode.",
    cancel_heading: "Fortryder du?",
    cancel_intro:
      "Restauranten har ikke accepteret ordren endnu. Du kan stadig annullere den og få hele beløbet refunderet.",
    cancel: "Annuller ordren",
    cancel_question:
      "Vil du annullere ordre #{number}? Det kan ikke fortrydes, og hele beløbet bliver refunderet.",
    cancel_confirm: "Ja, annuller ordren",
    cancel_keep: "Behold ordren",
    cancelling: "Annullerer …",
    cancelled_notice: "Ordren er annulleret. Se refusionen herunder.",
    cancel_refused_order_not_awaiting_acceptance:
      "Restauranten har allerede accepteret ordren, så du kan ikke annullere den her. Kontakt MTOGO med ordre #{number}, hvis du vil annullere den.",
    cancel_refused_acceptance_timing_unavailable:
      "Ordren kan ikke annulleres her. Kontakt MTOGO med ordre #{number}, hvis du vil annullere den.",
    cancel_refused_order_changed:
      "Ordren blev ændret samtidig. Her kan du se, hvordan den står nu.",
    cancel_refused_unknown_error:
      "Vi kunne ikke bekræfte annulleringen. Se ordrens status på siden, og prøv igen. En ordre annulleres og refunderes kun én gang.",
  },
  en: {
    title: "Order details",
    back: "Back to orders",
    date: "Ordered",
    items: "Items",
    delivery: "Delivery",
    contact: "Contact",
    total: "Total",
    cancellation: "Cancelled Order",
    cancelled_restaurant_rejected:
      "The Restaurant could not make your Order and cancelled it at {time}.",
    cancelled_acceptance_timeout:
      "The Restaurant did not accept your Order by the deadline at {time}, so it was cancelled.",
    cancelled_customer_cancelled: "You cancelled this Order at {time}.",
    refund_pending: "We are refunding {amount}. This may take a moment.",
    refund_failed:
      "The refund of {amount} has not gone through yet. You will still get your money back, and MTOGO will follow up.",
    refund_succeeded: "{amount} was refunded to your payment method.",
    cancel_heading: "Changed your mind?",
    cancel_intro:
      "The Restaurant has not accepted your Order yet. You can still cancel it and get a full refund.",
    cancel: "Cancel Order",
    cancel_question:
      "Cancel Order #{number}? This cannot be undone, and the full amount will be refunded.",
    cancel_confirm: "Yes, cancel Order",
    cancel_keep: "Keep Order",
    cancelling: "Cancelling …",
    cancelled_notice: "Your Order is cancelled. See the refund below.",
    cancel_refused_order_not_awaiting_acceptance:
      "The Restaurant has already accepted your Order, so it cannot be cancelled here. Contact MTOGO with Order #{number} if you want to cancel it.",
    cancel_refused_acceptance_timing_unavailable:
      "This Order cannot be cancelled here. Contact MTOGO with Order #{number} if you want to cancel it.",
    cancel_refused_order_changed:
      "The Order changed at the same time. Here is where it stands now.",
    cancel_refused_unknown_error:
      "We could not confirm the cancellation. Check the Order's status on this page and try again. An Order is only ever cancelled and refunded once.",
  },
} as const

/** Codes a Customer cancellation can be refused with; `unknown_error` covers the rest (#145). */
export const CUSTOMER_CANCEL_ERROR_CODES = [
  "order_not_awaiting_acceptance",
  "acceptance_timing_unavailable",
  "order_changed",
  "unknown_error",
] as const
export type CustomerCancelErrorCode =
  (typeof CUSTOMER_CANCEL_ERROR_CODES)[number]

/** The known refusal for a backend message, never the backend's own text. */
export const customerCancelErrorCode = (
  value: unknown,
): CustomerCancelErrorCode =>
  CUSTOMER_CANCEL_ERROR_CODES.find((code) => code === value) ?? "unknown_error"
