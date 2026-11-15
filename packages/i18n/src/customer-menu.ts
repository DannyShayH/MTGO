import type { Locale } from "./locale.ts"

type CustomerMenuText = Record<
  | "page_title"
  | "open"
  | "closed"
  | "closed_note"
  | "not_receiving"
  | "not_receiving_note"
  | "categories"
  | "price_note"
  | "sold_out"
  | "sold_out_note"
  | "no_photo"
  | "allergens_unknown"
  | "allergens_unknown_note"
  | "allergens_contains"
  | "allergens_may_contain"
  | "allergens_none"
  | "allergens_none_short"
  | "empty_title"
  | "empty_note"
  | "unavailable_title"
  | "unavailable_note"
  | "retry"
  | "not_found_title"
  | "not_found_note"
  | "back_to_restaurants"
  | "food_labels"
  | "food_label_yes"
  | "food_label_no"
  | "food_label_unknown"
  | string,
  string
>

/** Text of the Customer's Restaurant menu page. Dish and category names come from the Restaurant. */
export const CUSTOMER_MENU_TEXT: Record<Locale, CustomerMenuText> = {
  da: {
    page_title: "Menu",
    open: "Åben",
    closed: "Lukket",
    closed_note:
      "Restauranten er lukket og tager ikke imod bestillinger lige nu. Du kan stadig se menuen.",
    not_receiving: "Tager ikke imod bestillinger",
    not_receiving_note:
      "Restauranten tager ikke imod bestillinger lige nu. Du kan stadig se menuen.",
    categories: "Kategorier",
    price_note: "Priserne er i danske kroner inklusive moms og levering.",
    sold_out: "Udsolgt",
    sold_out_note: "Kan ikke bestilles lige nu.",
    no_photo: "Intet billede",
    allergen_info_missing: "Allergeninfo · ikke oplyst",
    allergens_unknown: "Allergener: ukendt",
    allergens_unknown_note:
      "Restauranten har ikke oplyst allergener for denne ret. Ukendt betyder aldrig allergenfri. Spørg restauranten, før du bestiller, hvis du har en allergi.",
    allergens_contains: "Indeholder",
    allergens_may_contain: "Kan indeholde",
    allergens_none:
      "Ingen af de angivne allergener er deklareret af restauranten.",
    allergens_none_short: "Ingen allergener deklareret",
    empty_title: "Ingen retter på menuen lige nu",
    empty_note:
      "Restauranten har ikke udgivet nogen retter endnu. Kig forbi igen senere.",
    unavailable_title: "Menuen kunne ikke hentes",
    unavailable_note: "Der gik noget galt hos os. Prøv igen om lidt.",
    retry: "Prøv igen",
    not_found_title: "Vi kan ikke finde restauranten",
    not_found_note:
      "Restauranten findes ikke, eller den er ikke med på MTOGO lige nu.",
    back_to_restaurants: "Tilbage til restauranterne",
    food_labels: "Ingredienser og mærker",
    food_label_yes: "Ja",
    food_label_no: "Nej",
    food_label_unknown: "Ukendt",
  },
  en: {
    page_title: "Menu",
    open: "Open",
    closed: "Closed",
    closed_note:
      "The Restaurant is closed and is not taking Orders right now. You can still read the menu.",
    not_receiving: "Not taking Orders",
    not_receiving_note:
      "The Restaurant is not taking Orders right now. You can still read the menu.",
    categories: "Categories",
    price_note: "Prices are in Danish kroner and include VAT and delivery.",
    sold_out: "Sold out",
    sold_out_note: "Cannot be ordered right now.",
    no_photo: "No photo",
    allergen_info_missing: "Allergen info · not provided",
    allergens_unknown: "Allergens: unknown",
    allergens_unknown_note:
      "The Restaurant has not declared allergens for this dish. Unknown never means allergen-free. Ask the Restaurant before you order if you have an allergy.",
    allergens_contains: "Contains",
    allergens_may_contain: "May contain",
    allergens_none:
      "The Restaurant has declared none of the listed allergens for this dish.",
    allergens_none_short: "No allergens declared",
    empty_title: "No dishes on the menu right now",
    empty_note:
      "The Restaurant has not published any dishes yet. Check back later.",
    unavailable_title: "The menu could not be loaded",
    unavailable_note: "Something went wrong on our side. Try again shortly.",
    retry: "Try again",
    not_found_title: "We cannot find the Restaurant",
    not_found_note:
      "The Restaurant does not exist, or it is not on MTOGO right now.",
    back_to_restaurants: "Back to the Restaurants",
    food_labels: "Ingredients and labels",
    food_label_yes: "Yes",
    food_label_no: "No",
    food_label_unknown: "Unknown",
  },
}

/**
 * Short names for the compact allergen summary on a menu, keyed by catalogue
 * code. Only codes whose catalogue name is long have one; the full catalogue
 * name is used for the rest and in the complete declaration.
 */
export const ALLERGEN_SHORT_NAMES: Record<Locale, Record<string, string>> = {
  da: { cereals: "Gluten", sesame: "Sesam", sulphites: "Sulfitter" },
  en: { cereals: "Gluten", sesame: "Sesame", sulphites: "Sulphites" },
}

/** The short name of a declared allergen when it has one, else its catalogue name. */
export const allergenShortName = (
  allergen: { code: string; name: Record<Locale, string> },
  locale: Locale,
) => ALLERGEN_SHORT_NAMES[locale][allergen.code] ?? allergen.name[locale]

const DKK_FORMATS: Record<Locale, Intl.NumberFormat> = {
  da: new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }),
  en: new Intl.NumberFormat("en", { style: "currency", currency: "DKK" }),
}

/**
 * A menu price as the design brief shows it: `129,00 kr.` in Danish and
 * `DKK 129.00` in English. The amount is in kroner, not øre.
 */
export const formatDkk = (amount: number, locale: Locale) =>
  DKK_FORMATS[locale].format(amount)
