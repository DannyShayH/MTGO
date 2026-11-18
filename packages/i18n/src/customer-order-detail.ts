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
      "Restauranten nåede ikke at acceptere din ordre i tide, så den blev annulleret {time}.",
    cancelled_customer_cancelled: "Du annullerede ordren {time}.",
    refund_pending: "Vi er ved at refundere {amount}. Det kan tage et øjeblik.",
    refund_failed:
      "Refusionen af {amount} er ikke gået igennem endnu. Du får stadig pengene tilbage, og MTOGO følger op.",
    refund_succeeded: "{amount} er refunderet til din betalingsmetode.",
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
      "The Restaurant did not accept your Order in time, so it was cancelled at {time}.",
    cancelled_customer_cancelled: "You cancelled this Order at {time}.",
    refund_pending: "We are refunding {amount}. This may take a moment.",
    refund_failed:
      "The refund of {amount} has not gone through yet. You will still get your money back, and MTOGO will follow up.",
    refund_succeeded: "{amount} was refunded to your payment method.",
  },
} as const
