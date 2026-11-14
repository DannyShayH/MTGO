import type { Locale } from "./locale.ts"

type CustomerHomeText = Record<
  | "page_title"
  | "page_description"
  | "heading"
  | "search_label"
  | "search_placeholder"
  | "search_button"
  | "search_hint"
  | "suggestions_label"
  | "searching"
  | "postal_code_count_one"
  | "postal_code_count_other"
  | "no_matches"
  | "lookup_failed"
  | "choices_heading"
  | "selected_postal_code"
  | "selected_town"
  | "town_note"
  | "clear_location"
  | "list_heading"
  | "restaurant_count_one"
  | "restaurant_count_other"
  | "serves_postal_code"
  | "serves_whole_town"
  | "serves_part_of_town"
  | "open"
  | "closed"
  | "closed_note"
  | "not_receiving"
  | "not_receiving_note"
  | "no_cover"
  | "empty_title"
  | "empty_note"
  | "empty_location_title"
  | "empty_location_note"
  | "postal_code_unknown_title"
  | "postal_code_unknown_note"
  | "town_unknown_title"
  | "town_unknown_note"
  | "list_failed_title"
  | "list_failed_note"
  | "retry",
  string
>

/** Text of the Customer homepage: the location search and the Restaurant list (#119). */
export const CUSTOMER_HOME_TEXT: Record<Locale, CustomerHomeText> = {
  da: {
    page_title: "Restauranter",
    page_description:
      "Find en restaurant, der leverer til dig, og se dens menu.",
    heading: "Mad fra restauranter nær dig",
    search_label: "Hvor skal vi levere?",
    search_placeholder: "Postnummer eller by, fx 2200 eller København K",
    search_button: "Find restauranter",
    search_hint: "Vælg et postnummer eller en by fra listen.",
    suggestions_label: "Steder",
    searching: "Søger…",
    postal_code_count_one: "1 postnummer",
    postal_code_count_other: "{count} postnumre",
    no_matches: "Ingen dansk by eller postnummer matcher “{q}”.",
    lookup_failed: "Søgningen virker ikke lige nu. Prøv igen om lidt.",
    choices_heading: "Vælg et sted",
    selected_postal_code: "Leverer til {postal_code} {name}",
    selected_town: "Leverer til {name}",
    town_note:
      "{name} har {count} postnumre. Om en restaurant leverer til din adresse, afhænger af dit præcise postnummer.",
    clear_location: "Vis alle restauranter",
    list_heading: "Restauranter",
    restaurant_count_one: "1 restaurant",
    restaurant_count_other: "{count} restauranter",
    serves_postal_code: "Leverer til {postal_code}",
    serves_whole_town: "Leverer til hele {name}",
    serves_part_of_town: "Leverer til {served} af {count} postnumre i {name}",
    open: "Åben",
    closed: "Lukket",
    closed_note: "Du kan se menuen, men ikke bestille lige nu.",
    not_receiving: "Tager ikke imod bestillinger",
    not_receiving_note: "Du kan se menuen, men ikke bestille lige nu.",
    no_cover: "Intet billede endnu",
    empty_title: "Ingen restauranter på MTOGO lige nu",
    empty_note: "Kig forbi igen senere.",
    empty_location_title: "Ingen restauranter leverer til {name} lige nu",
    empty_location_note:
      "Prøv et andet postnummer eller en anden by, eller vis alle restauranter.",
    postal_code_unknown_title: "{postal_code} er ikke et dansk postnummer",
    postal_code_unknown_note: "Tjek postnummeret, eller søg på din by.",
    town_unknown_title: "Vi kender ikke byen “{name}”",
    town_unknown_note: "Vælg en by fra listen, eller søg på dit postnummer.",
    list_failed_title: "Restauranterne kunne ikke hentes",
    list_failed_note: "Der gik noget galt hos os. Prøv igen om lidt.",
    retry: "Prøv igen",
  },
  en: {
    page_title: "Restaurants",
    page_description:
      "Find a Restaurant that delivers to you and read its menu.",
    heading: "Food from Restaurants near you",
    search_label: "Where should we deliver?",
    search_placeholder: "Postcode or town, for example 2200 or København K",
    search_button: "Find Restaurants",
    search_hint: "Choose a postcode or a town from the list.",
    suggestions_label: "Locations",
    searching: "Searching…",
    postal_code_count_one: "1 postcode",
    postal_code_count_other: "{count} postcodes",
    no_matches: "No Danish town or postcode matches “{q}”.",
    lookup_failed:
      "The location search is not working right now. Try again shortly.",
    choices_heading: "Choose a location",
    selected_postal_code: "Delivering to {postal_code} {name}",
    selected_town: "Delivering to {name}",
    town_note:
      "{name} has {count} postcodes. Whether a Restaurant delivers to your address depends on your exact postcode.",
    clear_location: "Show all Restaurants",
    list_heading: "Restaurants",
    restaurant_count_one: "1 Restaurant",
    restaurant_count_other: "{count} Restaurants",
    serves_postal_code: "Delivers to {postal_code}",
    serves_whole_town: "Delivers to all of {name}",
    serves_part_of_town: "Delivers to {served} of {count} postcodes in {name}",
    open: "Open",
    closed: "Closed",
    closed_note: "You can read the menu but not order right now.",
    not_receiving: "Not taking Orders",
    not_receiving_note: "You can read the menu but not order right now.",
    no_cover: "No photo yet",
    empty_title: "No Restaurants on MTOGO right now",
    empty_note: "Check back later.",
    empty_location_title: "No Restaurants deliver to {name} right now",
    empty_location_note:
      "Try another postcode or town, or show all Restaurants.",
    postal_code_unknown_title: "{postal_code} is not a Danish postcode",
    postal_code_unknown_note: "Check the postcode, or search for your town.",
    town_unknown_title: "We do not know the town “{name}”",
    town_unknown_note:
      "Choose a town from the list, or search for your postcode.",
    list_failed_title: "The Restaurants could not be loaded",
    list_failed_note: "Something went wrong on our side. Try again shortly.",
    retry: "Try again",
  },
}
