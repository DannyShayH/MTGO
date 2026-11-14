export const DISH_TEXT = {
  da: {
    title: "Retter",
    category_load_error: "Kategorierne kunne ikke hentes. Prøv igen.",
    load_error: "Menuen kunne ikke hentes. Prøv igen.",
    back: "Tilbage til menu",
    categories_link: "Administrer kategorier",
    empty: "Ingen retter endnu. Opret din første ret i en kategori.",
    add: "Opret ret",
    save: "Gem ret",
    saved: "Retten er gemt og vises på kundemenuen, når restauranten er aktiv.",
    name_da: "Rettens danske navn",
    name_en: "Rettens engelske navn",
    category: "Kategori",
    price: "Pris i DKK",
    hint: "Prisen inkluderer moms og levering. Skriv fx 95 eller 95,50.",
    unknown: "Allergenoplysninger, halal, chili og hvidløg: Ukendt.",
    photo: "Foto er valgfrit. Retten vises med en pladsholder.",
    no_categories: "Opret en kategori først, og vælg derefter Opret ret.",
    cancel: "Annuller",
    discard: "Du har ugemte ændringer. Vil du forlade siden?",
    choose: "Vælg kategori",
    retry: "Kontrollér og prøv igen",
    uncertain:
      "Svaret blev afbrudt. Kontrollér samme oprettelse, før du ændrer noget.",
    errors: {
      dish_publication_uncertain:
        "Oprettelsen kunne ikke bekræftes. Kontrollér og prøv igen med de samme oplysninger.",
      dish_input_invalid:
        "Udfyld begge navne med højst 120 tegn og kun almindelig tekst. Prisen skal være positiv med højst to decimaler.",
      category_not_found:
        "Kategorien findes ikke længere. Vælg en anden kategori.",
      dish_retry_conflict:
        "Denne oprettelse har allerede andre værdier. Kontrollér den oprindelige oprettelse.",
      dish_recovery_required:
        "Oprettelsen skal kontrolleres. Prøv igen, eller kontakt MTOGO.",
      unknown_error:
        "Retten kunne ikke bekræftes. Kontrollér og prøv igen med de samme oplysninger.",
    },
  },
  en: {
    title: "Dishes",
    category_load_error: "Categories could not be loaded. Try again.",
    load_error: "The menu could not be loaded. Try again.",
    back: "Back to menu",
    categories_link: "Manage categories",
    empty: "No dishes yet. Create your first dish in a category.",
    add: "Create dish",
    save: "Save dish",
    saved:
      "Dish saved. It appears on the Customer menu when the Restaurant is active.",
    name_da: "Dish name in Danish",
    name_en: "Dish name in English",
    category: "Category",
    price: "Price in DKK",
    hint: "Includes VAT and delivery. Enter e.g. 95 or 95.50.",
    unknown: "Allergen information, halal, chili and garlic: Unknown.",
    photo: "A photo is optional. The dish uses a placeholder.",
    no_categories: "Create a category first, then choose Create dish.",
    cancel: "Cancel",
    discard: "You have unsaved changes. Leave this page?",
    choose: "Choose category",
    retry: "Check and retry",
    uncertain:
      "The response was interrupted. Check this creation before changing anything.",
    errors: {
      dish_publication_uncertain:
        "Publication could not be confirmed. Check and retry with the same details.",
      dish_input_invalid:
        "Enter both names as plain text with at most 120 characters. The price must be positive with at most two decimal places.",
      category_not_found:
        "This category no longer exists. Choose another category.",
      dish_retry_conflict:
        "This creation already has different values. Check the original creation.",
      dish_recovery_required:
        "This creation needs checking. Retry or contact MTOGO.",
      unknown_error:
        "The dish could not be confirmed. Check and retry with the same details.",
    },
  },
} as const
export type DishErrorCode = keyof typeof DISH_TEXT.en.errors
export function isDishErrorCode(value: unknown): value is DishErrorCode {
  return typeof value === "string" && Object.hasOwn(DISH_TEXT.en.errors, value)
}
