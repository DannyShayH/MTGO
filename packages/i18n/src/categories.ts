export const CATEGORY_TEXT = {
  da: {
    title: "Kategorier",
    intro: "Organisér din menu. Gem navne på både dansk og engelsk.",
    empty: "Du har ingen kategorier endnu. Opret den første til dine retter.",
    add: "Opret kategori",
    edit: "Omdøb",
    remove: "Fjern",
    save: "Gem kategori",
    cancel: "Annuller",
    name_da: "Dansk navn",
    name_en: "Engelsk navn",
    hint: "Begge navne er påkrævede. Højst 120 tegn pr. sprog med bogstaver, tal og almindelig tegnsætning.",
    suggestions: "Forslag",
    suggestions_intro:
      "Tilføj en almindelig kategori med ét klik. Navnene er klar på dansk og engelsk, og du kan omdøbe dem bagefter.",
    add_suggestion: "Tilføj",
    saved: "Kategorien er gemt.",
    removed: "Kategorien er fjernet.",
    unavailable: "Kategorierne kunne ikke hentes. Prøv igen.",
    retry: "Hent igen",
    discard: "Du har ændringer, der ikke er gemt. Vil du forlade dem?",
    confirm_remove:
      "Vil du fjerne denne kategori? Kun tomme kategorier kan fjernes.",
    review: "Hent de seneste navne",
    latest: "Senest gemte navne",
    use_revision: "Behold mine navne og brug denne version",
    errors: {
      category_input_invalid:
        "Skriv et navn på begge sprog med 1–120 tegn. Brug kun bogstaver, tal, mellemrum og almindelig tegnsætning.",
      category_stale:
        "Kategorien er ændret af en anden. Hent og gennemgå de seneste navne, før du gemmer igen. Dine navne er bevaret.",
      category_not_empty:
        "Kategorien indeholder retter og kan ikke fjernes. Flyt eller fjern retterne først.",
      category_not_found:
        "Kategorien findes ikke længere. Hent listen igen. Dine navne er bevaret.",
      category_retry_conflict:
        "Denne oprettelse er allerede gemt med andre navne. Hent listen igen, før du prøver på ny.",
      category_retry_removed:
        "Kategorien blev oprettet og senere fjernet. Hent listen igen.",
      unknown_error:
        "Ændringen kunne ikke bekræftes. Dine navne er bevaret. Prøv igen.",
    },
  },
  en: {
    title: "Categories",
    intro: "Organize your menu. Save names in both Danish and English.",
    empty: "You have no categories yet. Create the first one for your dishes.",
    add: "Create category",
    edit: "Rename",
    remove: "Remove",
    save: "Save category",
    cancel: "Cancel",
    name_da: "Danish name",
    name_en: "English name",
    hint: "Both names are required. At most 120 characters per language, using letters, numbers and basic punctuation.",
    suggestions: "Suggestions",
    suggestions_intro:
      "Add a common category in one click. The names are ready in Danish and English, and you can rename them afterwards.",
    add_suggestion: "Add",
    saved: "Category saved.",
    removed: "Category removed.",
    unavailable: "Categories could not be loaded. Please try again.",
    retry: "Reload",
    discard: "You have unsaved changes. Do you want to leave them?",
    confirm_remove:
      "Remove this category? Only empty categories can be removed.",
    review: "Load the latest names",
    latest: "Latest saved names",
    use_revision: "Keep my names and use this version",
    errors: {
      category_input_invalid:
        "Enter names in both languages with 1–120 characters, using only letters, numbers, spaces and basic punctuation.",
      category_stale:
        "Someone changed this category. Load and review the latest names before saving again. Your names have been kept.",
      category_not_empty:
        "This category contains dishes and cannot be removed. Move or remove its dishes first.",
      category_not_found:
        "This category no longer exists. Reload the list. Your names have been kept.",
      category_retry_conflict:
        "This creation was already saved with different names. Reload the list before trying again.",
      category_retry_removed:
        "This category was created and later removed. Reload the list.",
      unknown_error:
        "The change could not be confirmed. Your names have been kept. Please try again.",
    },
  },
} as const
/**
 * Common menu categories offered as one-click additions. Each one is a
 * complete bilingual name, saved through the normal category creation.
 */
export const CATEGORY_SUGGESTIONS = [
  { id: "starters", da: "Forretter", en: "Starters" },
  { id: "mains", da: "Hovedretter", en: "Main courses" },
  { id: "desserts", da: "Desserter", en: "Desserts" },
  { id: "drinks", da: "Drikkevarer", en: "Drinks" },
  { id: "sides", da: "Tilbehør", en: "Sides" },
  { id: "dips", da: "Dips og saucer", en: "Dips and sauces" },
  { id: "pizza", da: "Pizza", en: "Pizza" },
  { id: "burgers", da: "Burgere", en: "Burgers" },
  { id: "pasta", da: "Pasta", en: "Pasta" },
  { id: "salads", da: "Salater", en: "Salads" },
  { id: "soups", da: "Supper", en: "Soups" },
  { id: "sandwiches", da: "Sandwiches", en: "Sandwiches" },
  { id: "sushi", da: "Sushi", en: "Sushi" },
  { id: "kebab", da: "Kebab og shawarma", en: "Kebab and shawarma" },
  { id: "wok", da: "Wok og nudler", en: "Wok and noodles" },
  { id: "breakfast", da: "Morgenmad", en: "Breakfast" },
  { id: "vegetarian", da: "Vegetarretter", en: "Vegetarian dishes" },
  { id: "kids", da: "Børnemenu", en: "Kids’ menu" },
  { id: "meal_deals", da: "Menutilbud", en: "Meal deals" },
] as const
export type CategorySuggestion = (typeof CATEGORY_SUGGESTIONS)[number]

/** Suggestions whose Danish or English name is not already on the menu. */
export function remainingCategorySuggestions(
  names: readonly { da: string; en: string }[],
): CategorySuggestion[] {
  const taken = new Set(
    names.flatMap((name) => [name.da, name.en]).map(normalizedCategoryName),
  )
  return CATEGORY_SUGGESTIONS.filter(
    (suggestion) =>
      !taken.has(normalizedCategoryName(suggestion.da)) &&
      !taken.has(normalizedCategoryName(suggestion.en)),
  )
}
function normalizedCategoryName(value: string) {
  return value.trim().toLocaleLowerCase("da")
}

export type CategoryErrorCode = keyof typeof CATEGORY_TEXT.en.errors
export function isCategoryErrorCode(
  value: unknown,
): value is CategoryErrorCode {
  return (
    typeof value === "string" && Object.hasOwn(CATEGORY_TEXT.en.errors, value)
  )
}
