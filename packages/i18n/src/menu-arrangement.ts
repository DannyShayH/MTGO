import type { Locale } from "./locale.ts"

export const MENU_ARRANGEMENT_TEXT = {
  da: {
    up: "Flyt op",
    down: "Flyt ned",
    move: "Flyt til kategori",
    move_short: "Flyt",
    move_to: "Flyt til",
    cancel: "Annuller",
    saved: "Rækkefølgen er gemt.",
    moved: "Retten er flyttet.",
    hint: "Brug pilene til at ændre rækkefølgen. Ændringer gemmes med det samme.",
    move_hint:
      "Retten placeres sidst i den valgte kategori. Indhold og pris bevares.",
    menu_order_stale:
      "Menuen er ændret i en anden fane eller af en kollega. Den aktuelle rækkefølge er indlæst. Kontrollér den, og prøv igen.",
    menu_order_invalid:
      "Rækkefølgen eller kategorien kunne ikke gemmes. Indlæs menuen igen, og prøv igen.",
    unknown_error:
      "Ændringen kunne ikke bekræftes. Indlæs menuen igen for at se den gemte rækkefølge.",
    retry: "Indlæs menuen igen",
    empty: "Ingen retter i denne kategori.",
    categories_link: "Skift kategoriernes rækkefølge",
  },
  en: {
    up: "Move up",
    down: "Move down",
    move: "Move to category",
    move_short: "Move",
    move_to: "Move to",
    cancel: "Cancel",
    saved: "Order saved.",
    moved: "Dish moved.",
    hint: "Use the arrows to change the order. Changes are saved immediately.",
    move_hint:
      "The dish goes to the end of the selected category. Its content and price stay the same.",
    menu_order_stale:
      "The menu changed in another tab or by a colleague. The current order has been loaded. Review it and try again.",
    menu_order_invalid:
      "The order or category could not be saved. Reload the menu and try again.",
    unknown_error:
      "The change could not be confirmed. Reload the menu to see the saved order.",
    retry: "Reload menu",
    empty: "No dishes in this category.",
    categories_link: "Change the category order",
  },
} satisfies Record<Locale, Record<string, string>>
export type MenuArrangementError =
  "menu_order_stale" | "menu_order_invalid" | "unknown_error"
export const isMenuArrangementError = (
  code: unknown,
): code is MenuArrangementError =>
  typeof code === "string" &&
  ["menu_order_stale", "menu_order_invalid", "unknown_error"].includes(code)
