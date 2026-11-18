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
  | "checked_at",
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
