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
    progress_heading: "Ordrens forløb",
    step_placed: "Ordre afgivet",
    step_accepted: "Restauranten har accepteret",
    step_preparing: "Tilberedes",
    step_ready: "Klar til afhentning",
    step_cancelled: "Annulleret",
    step_completed: "Gennemført",
    step_current: "Nu",
    step_upcoming: "Kommer senere",
    now_awaiting_acceptance:
      "Vi venter på, at restauranten accepterer din ordre.",
    now_accepted:
      "Restauranten har accepteret din ordre. Her kan du se, når den går i gang med maden.",
    now_preparing: "Restauranten er i gang med at lave din mad.",
    now_ready: "Maden er klar hos restauranten og venter på at blive hentet.",
    now_cancelled: "Ordren er annulleret.",
    state_awaiting_acceptance: "Venter på restauranten",
    state_accepted: "Accepteret",
    state_preparing: "Tilberedes",
    state_ready: "Klar til afhentning",
    state_cancelled: "Annulleret",
    progress_updated: "Opdateret {time}",
    progress_updating: "Opdaterer …",
    progress_refresh: "Opdater",
    progress_stale:
      "Vi kunne ikke hente den nyeste status. Sådan stod ordren {time}.",
    progress_unavailable:
      "Vi kan ikke vise ordrens forløb lige nu. Prøv at opdatere om lidt.",
    progress_paused:
      "Siden opdaterer ikke længere af sig selv. Tryk på Opdater for at se den nyeste status.",
    progress_refused:
      "Vi kan ikke længere vise ordrens forløb her. Log ind igen for at se den nyeste status.",
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
    progress_heading: "Your Order's progress",
    step_placed: "Order placed",
    step_accepted: "Restaurant accepted",
    step_preparing: "Preparing",
    step_ready: "Ready for pickup",
    step_cancelled: "Cancelled",
    step_completed: "Done",
    step_current: "Now",
    step_upcoming: "Upcoming",
    now_awaiting_acceptance:
      "We are waiting for the Restaurant to accept your Order.",
    now_accepted:
      "The Restaurant accepted your Order. You will see here when it starts on your food.",
    now_preparing: "The Restaurant is preparing your food.",
    now_ready: "Your food is ready at the Restaurant, waiting to be picked up.",
    now_cancelled: "This Order is cancelled.",
    state_awaiting_acceptance: "Waiting for the Restaurant",
    state_accepted: "Accepted",
    state_preparing: "Preparing",
    state_ready: "Ready for pickup",
    state_cancelled: "Cancelled",
    progress_updated: "Updated {time}",
    progress_updating: "Updating …",
    progress_refresh: "Refresh",
    progress_stale:
      "We could not get the latest status. This is how your Order stood at {time}.",
    progress_unavailable:
      "We cannot show your Order's progress right now. Try refreshing in a moment.",
    progress_paused:
      "This page no longer updates by itself. Select Refresh to see the latest status.",
    progress_refused:
      "We can no longer show this Order's progress here. Sign in again to see the latest status.",
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

/** The four food stages a Customer follows (#147); delivery belongs to #48. */
export const FOOD_STEPS = ["placed", "accepted", "preparing", "ready"] as const
export type FoodStepKey = (typeof FOOD_STEPS)[number]

/** The recorded facts of the Customer's progress read the timeline needs. */
export type FoodProgressFacts = {
  state:
    "awaiting_acceptance" | "accepted" | "preparing" | "ready" | "cancelled"
  placed_at: string | null
  accepted_at: string | null
  preparation_started_at: string | null
  ready_at: string | null
  cancellation: { effective_at: string } | null
}

export type FoodStep = {
  key: FoodStepKey | "cancelled"
  status: "completed" | "current" | "upcoming"
  /** The recorded time, or null when none was recorded or it is upcoming. */
  at: string | null
}

const REACHED_BY_STATE = {
  awaiting_acceptance: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
} as const

/**
 * The Order timeline's food steps from recorded facts only (#147). The step
 * the Order has reached is current, earlier ones completed and later ones
 * upcoming without a time. A cancelled Order keeps the milestones it really
 * reached and ends in a completed cancellation; the stages it never reached
 * are left out instead of being shown as still to come or falsely completed.
 */
export const foodProgressSteps = (facts: FoodProgressFacts): FoodStep[] => {
  const times: Record<FoodStepKey, string | null> = {
    placed: facts.placed_at,
    accepted: facts.accepted_at,
    preparing: facts.preparation_started_at,
    ready: facts.ready_at,
  }
  if (facts.state === "cancelled") {
    // Placement is a fact of every Order; later stages only when recorded.
    const reachedStages = FOOD_STEPS.filter(
      (key, index) => index === 0 || times[key] !== null,
    )
    // The cancellation is over, so it is done; no stage is still current.
    return [
      ...reachedStages.map((key) => ({
        key,
        status: "completed" as const,
        at: times[key],
      })),
      {
        key: "cancelled",
        status: "completed",
        at: facts.cancellation?.effective_at ?? null,
      },
    ]
  }
  const reached = REACHED_BY_STATE[facts.state]
  return FOOD_STEPS.map((key, index) => ({
    key,
    status:
      index < reached
        ? "completed"
        : index === reached
          ? "current"
          : "upcoming",
    at: index <= reached ? times[key] : null,
  }))
}
