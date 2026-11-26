export const CUSTOMER_ORDER_DETAIL_TEXT = {
  da: {
    title: "Ordredetaljer",
    back: "Tilbage til ordrer",
    date: "Bestilt",
    items: "Varer",
    delivery: "Levering",
    contact: "Kontakt",
    total: "I alt",
    delivery_included: "Levering er inkluderet",
    cancellation: "Annulleret ordre",
    refund_heading: "Refusion",
    cancelled_restaurant_rejected:
      "Restauranten kunne ikke lave din ordre og annullerede den {time}.",
    cancelled_acceptance_timeout:
      "Restauranten nåede ikke at acceptere din ordre inden fristen {time}, så den blev annulleret.",
    cancelled_customer_cancelled: "Du annullerede ordren {time}.",
    cancelled_unassigned_timeout:
      "Vi fandt ikke et bud til din ordre inden {time}, så MTOGO annullerede den. Du får hele beløbet tilbage.",
    cancelled_operator_cancelled:
      "MTOGO kunne ikke gennemføre din ordre og annullerede den {time}. Du får hele beløbet tilbage.",
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
    invitation: "Du kan bedømme din ordre",
    invitation_action: "Giv feedback",
    progress_heading: "Ordrens forløb",
    location_heading: "Buddets position",
    location_not_started: "Positionen deles efter afhentning.",
    location_unavailable: "Positionen er ikke tilgængelig endnu.",
    location_fresh: "Seneste målte position er aktuel.",
    location_stale: "Seneste målte position er ikke længere aktuel.",
    location_ended: "Positionsdeling er afsluttet.",
    location_age: "Målt for {seconds} sekunder siden.",
    location_coordinates: "Afrundede koordinater: {latitude}°, {longitude}°.",
    location_accuracy: "Rapporteret nøjagtighed: {meters} meter.",
    location_accuracy_unknown: "Nøjagtighed er ikke oplyst.",
    map_label: "Kort over buddets senest målte position",
    map_loading: "Indlæser kort…",
    map_failed:
      "Kortet kunne ikke indlæses. Positionens alder og nøjagtighed står nedenfor.",
    map_precise: "Prikken viser den målte position.",
    map_approximate:
      "Nøjagtigheden er for lav til en præcis prik, så kortet viser kun et område.",
    map_stale:
      "Positionen er ikke længere aktuel. Kortet flytter den ikke, før en ny er målt.",
    step_placed: "Ordre afgivet",
    step_accepted: "Restauranten har accepteret",
    step_preparing: "Tilberedes",
    step_ready: "Klar til afhentning",
    step_cancelled: "Annulleret",
    step_assigned: "Et bud er fundet",
    step_finding_agent: "Vi finder et bud",
    step_picked_up: "Afhentet",
    step_delivered: "Leveret",
    step_failed: "Leveringen kunne ikke gennemføres",
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
    now_delivered: "Din ordre er leveret.",
    now_failed: "Leveringen kunne ikke gennemføres.",
    now_picked_up: "Buddet har afhentet din ordre.",
    state_awaiting_acceptance: "Venter på restauranten",
    state_accepted: "Accepteret",
    state_preparing: "Tilberedes",
    state_ready: "Klar til afhentning",
    state_cancelled: "Annulleret",
    state_delivered: "Leveret",
    state_failed: "Levering afsluttet",
    state_picked_up: "Afhentet",
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
    connection_connecting: "Forbinder til løbende opdateringer …",
    connection_live: "Opdateres løbende",
    connection_fulfilled: "Leveret",
    connection_checking:
      "Løbende opdateringer er afbrudt. Vi tjekker status hvert {seconds}. sekund.",
  },
  en: {
    title: "Order details",
    back: "Back to orders",
    date: "Ordered",
    items: "Items",
    delivery: "Delivery",
    contact: "Contact",
    total: "Total",
    delivery_included: "Delivery included",
    cancellation: "Cancelled Order",
    refund_heading: "Refund",
    cancelled_restaurant_rejected:
      "The Restaurant could not make your Order and cancelled it at {time}.",
    cancelled_acceptance_timeout:
      "The Restaurant did not accept your Order by the deadline at {time}, so it was cancelled.",
    cancelled_customer_cancelled: "You cancelled this Order at {time}.",
    cancelled_unassigned_timeout:
      "We could not find a Delivery agent for your Order by {time}, so MTOGO cancelled it. You will get the full amount back.",
    cancelled_operator_cancelled:
      "MTOGO could not complete your Order and cancelled it at {time}. You will get the full amount back.",
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
    invitation: "You can rate your Order",
    invitation_action: "Give Feedback",
    progress_heading: "Your Order's progress",
    location_heading: "Delivery agent location",
    location_not_started: "Location sharing starts after pickup.",
    location_unavailable: "Location is not available yet.",
    location_fresh: "The latest measured location is current.",
    location_stale: "The latest measured location is no longer current.",
    location_ended: "Location sharing has ended.",
    location_age: "Measured {seconds} seconds ago.",
    location_coordinates: "Rounded coordinates: {latitude}°, {longitude}°.",
    location_accuracy: "Reported accuracy: {meters} metres.",
    location_accuracy_unknown: "Accuracy was not reported.",
    map_label: "Map of the delivery agent's last measured location",
    map_loading: "Loading map…",
    map_failed:
      "The map could not load. The location's age and accuracy are shown below.",
    map_precise: "The dot shows the measured location.",
    map_approximate:
      "Accuracy is too low for an exact dot, so the map shows only an area.",
    map_stale:
      "This location is no longer current. The map does not move it until a new one is measured.",
    step_placed: "Order placed",
    step_accepted: "Restaurant accepted",
    step_preparing: "Preparing",
    step_ready: "Ready for pickup",
    step_cancelled: "Cancelled",
    step_assigned: "Delivery agent assigned",
    step_finding_agent: "Finding a Delivery agent",
    step_picked_up: "Picked up",
    step_delivered: "Delivered",
    step_failed: "Delivery could not be completed",
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
    now_delivered: "Your Order has been delivered.",
    now_failed: "Delivery could not be completed.",
    now_picked_up: "The Delivery agent has picked up your Order.",
    state_awaiting_acceptance: "Waiting for the Restaurant",
    state_accepted: "Accepted",
    state_preparing: "Preparing",
    state_ready: "Ready for pickup",
    state_cancelled: "Cancelled",
    state_delivered: "Delivered",
    state_failed: "Delivery ended",
    state_picked_up: "Picked up",
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
    connection_connecting: "Connecting to live updates …",
    connection_live: "Live updates on",
    connection_fulfilled: "Fulfilled",
    connection_checking:
      "Live updates are interrupted. We check the status every {seconds} seconds.",
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
  delivery?: {
    assigned_at: string | null
    picked_up_at: string | null
    delivered_at: string | null
    ended_at: string | null
    outcome: "delivered" | "cancelled" | "failed" | null
  } | null
}

export type FoodStep = {
  key:
    | FoodStepKey
    | "cancelled"
    | "finding_agent"
    | "assigned"
    | "picked_up"
    | "delivered"
    | "failed"
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
  if (facts.state === "cancelled" || facts.delivery?.outcome) {
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
      ...(facts.delivery?.assigned_at
        ? [
            {
              key: "assigned" as const,
              status: "completed" as const,
              at: facts.delivery.assigned_at,
            },
          ]
        : []),
      ...(facts.delivery?.picked_up_at
        ? [
            {
              key: "picked_up" as const,
              status: "completed" as const,
              at: facts.delivery.picked_up_at,
            },
          ]
        : []),
      {
        key:
          facts.state === "cancelled" || facts.delivery?.outcome === "cancelled"
            ? "cancelled"
            : facts.delivery?.outcome === "delivered"
              ? "delivered"
              : "failed",
        status: "completed",
        at:
          facts.cancellation?.effective_at ?? facts.delivery?.ended_at ?? null,
      },
    ]
  }
  const reached = REACHED_BY_STATE[facts.state]
  const food: FoodStep[] = FOOD_STEPS.map((key, index) => ({
    key,
    status:
      index < reached
        ? "completed"
        : index === reached
          ? "current"
          : "upcoming",
    at: index <= reached ? times[key] : null,
  }))
  if (!facts.delivery) return food
  const { assigned_at, picked_up_at, delivered_at, outcome } = facts.delivery
  if (outcome === "delivered" || picked_up_at)
    for (const step of food)
      if (step.status === "current") step.status = "completed"
  return [
    ...food,
    assigned_at
      ? { key: "assigned", status: "completed", at: assigned_at }
      : { key: "finding_agent", status: "current", at: null },
    {
      key: "picked_up",
      status: picked_up_at ? "completed" : "upcoming",
      at: picked_up_at,
    },
    {
      key: "delivered",
      status: delivered_at ? "completed" : "upcoming",
      at: delivered_at,
    },
  ]
}
