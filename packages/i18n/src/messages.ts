import type { Locale } from "./locale.ts"

/**
 * Text for outcomes the API and the partner app report as codes. The API never
 * sends sentences (ADR-0018), so each code has a text in every language here.
 */
export type MessageCode =
  | "sign_in_failed"
  | "staff_access_revoked"
  | "session_expired"
  | "signed_out"
  | "unknown_error"
  | "invitation_invalid"
  | "password_too_short"

export type Messages = {
  text: {
    app_name: string
    language: string
    sign_in_title: string
    sign_in_intro: string
    email: string
    password: string
    sign_in: string
    sign_out: string
    navigation: string
    overview: string
    signed_in_as: string
    restaurant: string
    invitation_title: string
    invitation_intro: string
    name: string
    choose_password: string
    password_hint: string
    accept_invitation: string
    participation: string
    awaiting_activation: string
    active: string
    restaurant_details: string
    details_read_only: string
    pickup_address: string
    contact_phone: string
    contact_email: string
    delivery_area: string
    no_delivery_area: string
    /** Stands in for the Restaurant's name when the access-ended message does not know it. */
    former_restaurant: string
  }
  codes: Record<MessageCode, string>
}

/** Language names are shown in their own language, so they do not change with the locale. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  da: "Dansk",
  en: "English",
}

export const MESSAGES: Record<Locale, Messages> = {
  da: {
    text: {
      app_name: "MTOGO Partner",
      language: "Sprog",
      sign_in_title: "Log ind",
      sign_in_intro: "Log ind for at drive din restaurant på MTOGO.",
      email: "E-mail",
      password: "Adgangskode",
      sign_in: "Log ind",
      sign_out: "Log ud",
      navigation: "Hovedmenu",
      overview: "Overblik",
      signed_in_as: "Logget ind som",
      restaurant: "Restaurant",
      invitation_title: "Accepter din invitation",
      invitation_intro:
        "MTOGO har inviteret dig til at drive {restaurant}. Vælg en adgangskode for at komme i gang.",
      name: "Navn",
      choose_password: "Vælg adgangskode",
      password_hint: "Mindst {min} tegn.",
      accept_invitation: "Accepter og log ind",
      participation: "Deltagelse",
      awaiting_activation: "Afventer aktivering af MTOGO",
      active: "Aktiv",
      restaurant_details: "Restaurantens oplysninger",
      details_read_only:
        "Kun MTOGO kan ændre oplysningerne. Kontakt MTOGO, hvis noget er forkert.",
      pickup_address: "Afhentningsadresse",
      contact_phone: "Telefon",
      contact_email: "E-mail",
      delivery_area: "Leveringsområde",
      no_delivery_area: "Intet leveringsområde endnu.",
      former_restaurant: "restauranten",
    },
    codes: {
      sign_in_failed: "E-mail eller adgangskode er forkert.",
      staff_access_revoked:
        "Din adgang til {restaurant} er ophørt. Kontakt MTOGO, hvis det er en fejl.",
      session_expired: "Din session er udløbet. Log ind igen.",
      signed_out: "Du er logget ud.",
      unknown_error: "Noget gik galt. Prøv igen om lidt.",
      invitation_invalid:
        "Denne invitation er ikke længere gyldig. Bed MTOGO om en ny.",
      password_too_short: "Adgangskoden skal have mindst {min} tegn.",
    },
  },
  en: {
    text: {
      app_name: "MTOGO Partner",
      language: "Language",
      sign_in_title: "Sign in",
      sign_in_intro: "Sign in to operate your Restaurant on MTOGO.",
      email: "Email",
      password: "Password",
      sign_in: "Sign in",
      sign_out: "Sign out",
      navigation: "Main menu",
      overview: "Overview",
      signed_in_as: "Signed in as",
      restaurant: "Restaurant",
      invitation_title: "Accept your invitation",
      invitation_intro:
        "MTOGO has invited you to operate {restaurant}. Choose a password to get started.",
      name: "Name",
      choose_password: "Choose a password",
      password_hint: "At least {min} characters.",
      accept_invitation: "Accept and sign in",
      participation: "Participation",
      awaiting_activation: "Awaiting activation by MTOGO",
      active: "Active",
      restaurant_details: "Restaurant details",
      details_read_only:
        "Only MTOGO can change these details. Contact MTOGO if something is wrong.",
      pickup_address: "Pickup address",
      contact_phone: "Phone",
      contact_email: "Email",
      delivery_area: "Delivery area",
      no_delivery_area: "No delivery area yet.",
      former_restaurant: "the Restaurant",
    },
    codes: {
      sign_in_failed: "The email or password is incorrect.",
      staff_access_revoked:
        "Your access to {restaurant} has ended. Contact MTOGO if this is a mistake.",
      session_expired: "Your session has expired. Please sign in again.",
      signed_out: "You are signed out.",
      unknown_error: "Something went wrong. Please try again shortly.",
      invitation_invalid:
        "This invitation is no longer valid. Ask MTOGO for a new one.",
      password_too_short: "The password must have at least {min} characters.",
    },
  },
}

export const isMessageCode = (value: unknown): value is MessageCode =>
  typeof value === "string" && value in MESSAGES.da.codes
