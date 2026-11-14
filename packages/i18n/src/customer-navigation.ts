import type { Locale } from "./locale.ts"

type CustomerNavigationText = Record<
  | "menu_button"
  | "close_menu"
  | "restaurants"
  | "account"
  | "basket"
  | "tagline"
  | "footer_mtogo"
  | "footer_help"
  | "contact"
  | "terms"
  | "privacy"
  | "rights",
  string
>

/** Text of the Customer header, side menu and footer (#119). */
export const CUSTOMER_NAVIGATION_TEXT: Record<Locale, CustomerNavigationText> =
  {
    da: {
      menu_button: "Menu",
      close_menu: "Luk menuen",
      restaurants: "Restauranter",
      account: "Konto",
      basket: "Kurv",
      tagline: "Mad fra lokale restauranter, leveret til din dør.",
      footer_mtogo: "MTOGO",
      footer_help: "Hjælp",
      contact: "Kontakt",
      terms: "Handelsbetingelser",
      privacy: "Privatlivspolitik",
      rights: "Alle rettigheder forbeholdes.",
    },
    en: {
      menu_button: "Menu",
      close_menu: "Close menu",
      restaurants: "Restaurants",
      account: "Account",
      basket: "Basket",
      tagline: "Food from local Restaurants, delivered to your door.",
      footer_mtogo: "MTOGO",
      footer_help: "Help",
      contact: "Contact",
      terms: "Terms of service",
      privacy: "Privacy policy",
      rights: "All rights reserved.",
    },
  }
