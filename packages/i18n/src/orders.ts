import type { Locale } from "./locale.ts"

type OrderText = Record<
  | "title"
  | "intro"
  | "views"
  | "view_awaiting"
  | "view_active"
  | "view_history"
  | "empty_awaiting"
  | "empty_active"
  | "empty_history"
  | "unavailable"
  | "retry_hint"
  | "retry"
  | "refresh"
  | "loading"
  | "reference"
  | "placed"
  | "accept_by"
  | "window_elapsed"
  | "deadline_was"
  | "timing_unavailable"
  | "timing_unavailable_hint"
  | "state_awaiting_acceptance"
  | "state_accepted"
  | "state_preparing"
  | "state_ready"
  | "state_cancelled"
  | "items"
  | "dish"
  | "item_count"
  | "quantity"
  | "unit_price"
  | "line_total"
  | "total"
  | "open_order"
  | "back"
  | "not_found"
  | "not_found_hint"
  | "pages"
  | "previous"
  | "next"
  | "page_of"
  | "checked_at"
  | "allergens"
  | "allergens_unknown"
  | "allergens_contains"
  | "allergens_may_contain"
  | "allergens_none"
  | "food_labels"
  | "label_yes"
  | "label_no"
  | "label_unknown"
  | "facts_unavailable"
  | "retained_title"
  | "accept"
  | "accepting"
  | "accept_hint"
  | "accepted_notice"
  | "accepted_at"
  | "refreshed_hint"
  | "connection_connecting"
  | "connection_live"
  | "connection_reconnecting"
  | "connection_fallback"
  | "connection_offline"
  | "try_again"
  | "reject"
  | "reject_intro"
  | "reject_reason"
  | "reject_reason_hint"
  | "reject_reason_count"
  | "reject_confirm"
  | "rejecting"
  | "reject_keep"
  | "reject_unknown"
  | "rejected_notice"
  | "cancellation"
  | "cancelled_restaurant_rejected"
  | "cancelled_acceptance_timeout"
  | "cancelled_customer_cancelled"
  | "cancellation_note"
  | "refund"
  | "refund_pending"
  | "refund_failed"
  | "refund_succeeded"
  | "refund_none"
  | "operator_boundary"
  | "refund_short_pending"
  | "refund_short_failed"
  | "refund_short_succeeded",
  string
>

/** The partner Orders workspace (#140). Order references are `#{display_id}`. */
export const ORDER_TEXT: Record<Locale, OrderText> = {
  da: {
    title: "Ordrer",
    intro:
      "Betalte ordrer til din restaurant. De ordrer, der skal accepteres først, står øverst.",
    views: "Ordrevisninger",
    view_awaiting: "Afventer accept",
    view_active: "I gang",
    view_history: "Historik",
    empty_awaiting: "Ingen ordrer afventer accept lige nu.",
    empty_active: "Ingen accepterede ordrer er i gang.",
    empty_history: "Ingen annullerede ordrer endnu.",
    unavailable: "Ordrerne kunne ikke hentes",
    retry_hint: "Prøv igen om lidt. Dine ordrer er ikke ændret.",
    retry: "Prøv igen",
    refresh: "Opdater",
    loading: "Henter ordrer…",
    reference: "Ordre #{number}",
    placed: "Afgivet {time}",
    accept_by: "Accepter senest {time}",
    window_elapsed: "Fristen for accept udløb {time}",
    deadline_was: "Frist for accept: {time}",
    timing_unavailable: "Tidspunkt ukendt",
    timing_unavailable_hint:
      "Ordren blev afgivet, før tidspunkter blev registreret. Der vises ingen frist.",
    state_awaiting_acceptance: "Afventer accept",
    state_accepted: "Accepteret",
    state_preparing: "Tilberedes",
    state_ready: "Klar til afhentning",
    state_cancelled: "Annulleret",
    items: "Retter",
    dish: "Ret",
    item_count: "{count} stk.",
    quantity: "Antal",
    unit_price: "Stykpris",
    line_total: "I alt",
    total: "Ordretotal inkl. moms",
    open_order: "Se ordre #{number}",
    back: "Tilbage til ordrer",
    not_found: "Ordren findes ikke",
    not_found_hint:
      "Den hører ikke til din restaurant, eller linket er forkert.",
    pages: "Sider",
    previous: "Forrige",
    next: "Næste",
    page_of: "Side {page} af {pages}",
    checked_at: "Hentet {time}",
    allergens: "Allergener",
    allergens_unknown: "Allergener: ukendt. Ukendt betyder aldrig allergenfri.",
    allergens_contains: "Indeholder",
    allergens_may_contain: "Kan indeholde",
    allergens_none: "Ingen allergener deklareret",
    food_labels: "Øvrige madoplysninger",
    label_yes: "ja",
    label_no: "nej",
    label_unknown: "ukendt",
    retained_title: "{name} (engelsk navn)",
    facts_unavailable:
      "Dansk navn og madoplysninger blev ikke gemt, da ordren blev afgivet. Tjek med en MTOGO-operatør, hvis du er i tvivl.",
    accept: "Accepter ordre",
    accepting: "Accepterer…",
    accept_hint:
      "Når I accepterer, lover I at lave maden. Tilberedning registreres bagefter for sig.",
    accepted_notice: "Ordre #{number} er accepteret.",
    accepted_at: "Accepteret {time}",
    refreshed_hint: "Ordren er hentet igen og viser nu, hvordan den står.",
    connection_connecting: "Opretter forbindelse …",
    connection_live: "Live: nye ordrer vises automatisk",
    connection_reconnecting: "Forbindelsen blev afbrudt. Forbinder igen …",
    connection_fallback:
      "Live-opdatering er ikke tilgængelig. Ordrerne hentes automatisk hvert {seconds}. sekund.",
    connection_offline:
      "Ingen forbindelse. Ordrerne er måske ikke aktuelle. Prøver igen automatisk.",
    try_again: "Prøv igen",
    reject: "Afvis ordre",
    reject_intro:
      "Afvis kun, hvis I ikke kan lave maden. Ordren annulleres, og kunden får automatisk hele beløbet tilbage.",
    reject_reason: "Begrundelse (valgfri)",
    reject_reason_hint:
      "Kun for jeres restaurant og MTOGO. Kunden ser den ikke.",
    reject_reason_count: "{count} af {max} tegn",
    reject_confirm: "Afvis og refunder",
    rejecting: "Afviser…",
    reject_keep: "Behold ordren",
    reject_unknown:
      "Vi ved ikke, om ordren blev afvist. Se ordrens status, og prøv igen. En ordre annulleres og refunderes kun én gang.",
    rejected_notice: "Ordre #{number} er afvist og annulleret.",
    cancellation: "Annullering og refusion",
    cancelled_restaurant_rejected: "Afvist af jeres restaurant {time}",
    cancelled_acceptance_timeout:
      "Annulleret automatisk, fordi fristen for accept udløb {time} (registreret {processed})",
    cancelled_customer_cancelled: "Annulleret af kunden {time}",
    cancellation_note: "Jeres begrundelse",
    refund: "Refusion",
    refund_pending: "Refusion af {amount} til kunden er i gang.",
    refund_failed:
      "Refusionen af {amount} mislykkedes. Beløbet skyldes stadig kunden, og MTOGO følger op.",
    refund_succeeded: "{amount} er refunderet til kunden.",
    refund_none: "Der var ingen betaling at refundere.",
    refund_short_pending: "Refusion i gang",
    refund_short_failed: "Refusion mislykkedes – skyldes stadig",
    refund_short_succeeded: "Refunderet",
    operator_boundary:
      "Kan I ikke lave maden alligevel? Kontakt MTOGO med ordre #{number}. En accepteret ordre kan kun annulleres af MTOGO.",
  },
  en: {
    title: "Orders",
    intro:
      "Paid Orders for your Restaurant. Orders to accept soonest are at the top.",
    views: "Order views",
    view_awaiting: "Awaiting acceptance",
    view_active: "In progress",
    view_history: "History",
    empty_awaiting: "No Orders are awaiting acceptance right now.",
    empty_active: "No accepted Orders are in progress.",
    empty_history: "No cancelled Orders yet.",
    unavailable: "Orders could not be loaded",
    retry_hint: "Try again shortly. Your Orders have not changed.",
    retry: "Try again",
    refresh: "Refresh",
    loading: "Loading Orders…",
    reference: "Order #{number}",
    placed: "Placed {time}",
    accept_by: "Accept by {time}",
    window_elapsed: "Acceptance window ended {time}",
    deadline_was: "Acceptance deadline: {time}",
    timing_unavailable: "Timing unknown",
    timing_unavailable_hint:
      "This Order was placed before times were recorded. No deadline is shown.",
    state_awaiting_acceptance: "Awaiting acceptance",
    state_accepted: "Accepted",
    state_preparing: "Preparing",
    state_ready: "Ready for pickup",
    state_cancelled: "Cancelled",
    items: "Dishes",
    dish: "Dish",
    item_count: "{count}×",
    quantity: "Quantity",
    unit_price: "Unit price",
    line_total: "Total",
    total: "Order total incl. VAT",
    open_order: "View Order #{number}",
    back: "Back to Orders",
    not_found: "Order not found",
    not_found_hint:
      "It does not belong to your Restaurant, or the link is wrong.",
    pages: "Pages",
    previous: "Previous",
    next: "Next",
    page_of: "Page {page} of {pages}",
    checked_at: "Loaded {time}",
    allergens: "Allergens",
    allergens_unknown: "Allergens: unknown. Unknown never means allergen-free.",
    allergens_contains: "Contains",
    allergens_may_contain: "May contain",
    allergens_none: "No allergens declared",
    food_labels: "Additional food information",
    label_yes: "yes",
    label_no: "no",
    label_unknown: "unknown",
    retained_title: "{name}",
    facts_unavailable:
      "Danish name and food information were not recorded when this Order was placed. Check with an MTOGO operator if in doubt.",
    accept: "Accept Order",
    accepting: "Accepting…",
    accept_hint:
      "Accepting commits you to making the food. Preparation is recorded separately afterwards.",
    accepted_notice: "Order #{number} is accepted.",
    accepted_at: "Accepted {time}",
    refreshed_hint: "The Order was loaded again and now shows where it stands.",
    connection_connecting: "Connecting …",
    connection_live: "Live: new Orders appear automatically",
    connection_reconnecting: "Connection lost. Reconnecting …",
    connection_fallback:
      "Live updates are unavailable. Orders are reloaded every {seconds} seconds.",
    connection_offline:
      "No connection. Orders may be out of date. Retrying automatically.",
    try_again: "Try again",
    reject: "Reject Order",
    reject_intro:
      "Reject only if you cannot make the food. The Order is cancelled and the Customer is refunded in full automatically.",
    reject_reason: "Reason (optional)",
    reject_reason_hint:
      "Only for your Restaurant and MTOGO. The Customer does not see it.",
    reject_reason_count: "{count} of {max} characters",
    reject_confirm: "Reject and refund",
    rejecting: "Rejecting…",
    reject_keep: "Keep Order",
    reject_unknown:
      "We could not confirm whether the Order was rejected. Check its status and try again. An Order is only ever cancelled and refunded once.",
    rejected_notice: "Order #{number} is rejected and cancelled.",
    cancellation: "Cancellation and refund",
    cancelled_restaurant_rejected: "Rejected by your Restaurant at {time}",
    cancelled_acceptance_timeout:
      "Cancelled automatically because the acceptance deadline passed at {time} (recorded {processed})",
    cancelled_customer_cancelled: "Cancelled by the Customer at {time}",
    cancellation_note: "Your reason",
    refund: "Refund",
    refund_pending: "Refund of {amount} to the Customer is in progress.",
    refund_failed:
      "The refund of {amount} failed. It is still owed to the Customer, and MTOGO will follow up.",
    refund_succeeded: "{amount} was refunded to the Customer.",
    refund_none: "There was no payment to refund.",
    refund_short_pending: "Refund in progress",
    refund_short_failed: "Refund failed – still owed",
    refund_short_succeeded: "Refunded",
    operator_boundary:
      "Can you no longer make the food? Contact MTOGO with Order #{number}. Only MTOGO can cancel an accepted Order.",
  },
}

/** Codes an Order action can be refused with; `unknown_error` covers the rest. */
export const ORDER_ACTION_ERROR_CODES = [
  "acceptance_window_elapsed",
  "acceptance_timing_unavailable",
  "order_not_awaiting_acceptance",
  "order_changed",
  "order_not_found",
  "unknown_error",
] as const
export type OrderActionErrorCode = (typeof ORDER_ACTION_ERROR_CODES)[number]

export function isOrderActionErrorCode(
  value: unknown,
): value is OrderActionErrorCode {
  return ORDER_ACTION_ERROR_CODES.some((code) => code === value)
}

export const ORDER_ACTION_ERRORS: Record<
  Locale,
  Record<OrderActionErrorCode, string>
> = {
  da: {
    acceptance_window_elapsed:
      "Fristen for accept er udløbet, så ordren kan ikke længere accepteres.",
    acceptance_timing_unavailable:
      "Ordren har ingen registreret frist og kan ikke accepteres her. Kontakt MTOGO med ordrenummeret.",
    order_not_awaiting_acceptance: "Ordren afventer ikke længere accept.",
    order_changed: "Ordren blev ændret samtidig. Se, hvordan den står nu.",
    order_not_found: "Ordren findes ikke for din restaurant.",
    unknown_error:
      "Vi ved ikke, om ordren blev accepteret. Se ordrens status, og prøv igen. En ordre accepteres kun én gang.",
  },
  en: {
    acceptance_window_elapsed:
      "The acceptance deadline has passed, so this Order can no longer be accepted.",
    acceptance_timing_unavailable:
      "This Order has no recorded deadline and cannot be accepted here. Contact MTOGO with the Order number.",
    order_not_awaiting_acceptance:
      "This Order is no longer awaiting acceptance.",
    order_changed:
      "The Order changed at the same time. Check where it stands now.",
    order_not_found: "This Order was not found for your Restaurant.",
    unknown_error:
      "We could not confirm whether the Order was accepted. Check its status and try again. An Order is only ever accepted once.",
  },
}

const TIME_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  da: new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }),
}

/** A backend timestamp on the Restaurant's clock, whatever the server's time zone. */
export const formatOrderTime = (iso: string, locale: Locale) =>
  TIME_FORMATS[locale].format(new Date(iso))
