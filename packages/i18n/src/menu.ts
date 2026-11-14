import type { Locale } from "./locale.ts"

type MenuText = Record<
  | "title"
  | "intro"
  | "allergens"
  | "legend_intro"
  | "specific_types"
  | "food_labels"
  | "food_labels_intro"
  | "unknown_note"
  | "unavailable"
  | "retry_hint"
  | "retry"
  | "loading",
  string
>

export const MENU_TEXT: Record<Locale, MenuText> = {
  da: {
    title: "Menu",
    intro:
      "Madoplysninger samlet ét sted. Brug kataloget som opslagsværk til restaurantens menu.",
    allergens: "De 14 EU-allergener",
    legend_intro:
      "Åbn et allergen for at læse beskrivelsen og eventuelle specifikke typer.",
    specific_types: "Specifikke typer",
    food_labels: "Øvrige madoplysninger",
    food_labels_intro:
      "Disse mærkninger er adskilt fra EU-allergenerne og har ikke allergennumre.",
    unknown_note:
      "Kataloget beskriver ikke en bestemt ret. Manglende oplysninger betyder ukendt, aldrig allergenfri. Indeholder og kan indeholde er forskellige oplysninger.",
    unavailable: "Kataloget er ikke tilgængeligt",
    retry_hint: "Madoplysningerne kunne ikke hentes. Prøv igen om lidt.",
    retry: "Prøv igen",
    loading: "Henter madoplysninger…",
  },
  en: {
    title: "Menu",
    intro:
      "Food information in one place. Use this catalogue as a reference for your Restaurant’s menu.",
    allergens: "The 14 EU allergens",
    legend_intro:
      "Open an allergen to read its description and any specific types.",
    specific_types: "Specific types",
    food_labels: "Additional food information",
    food_labels_intro:
      "These labels are separate from EU allergens and have no allergen numbers.",
    unknown_note:
      "This catalogue does not describe a particular dish. Missing information means unknown, never allergen-free. Contains and may contain are different declarations.",
    unavailable: "Catalogue unavailable",
    retry_hint:
      "Food information could not be loaded. Please try again shortly.",
    retry: "Try again",
    loading: "Loading food information…",
  },
}
