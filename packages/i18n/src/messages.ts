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
    },
    codes: {
      sign_in_failed: "E-mail eller adgangskode er forkert.",
      staff_access_revoked:
        "Din adgang til restauranten er ophørt. Kontakt MTOGO, hvis det er en fejl.",
      session_expired: "Din session er udløbet. Log ind igen.",
      signed_out: "Du er logget ud.",
      unknown_error: "Noget gik galt. Prøv igen om lidt.",
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
    },
    codes: {
      sign_in_failed: "The email or password is incorrect.",
      staff_access_revoked:
        "Your access to the Restaurant has ended. Contact MTOGO if this is a mistake.",
      session_expired: "Your session has expired. Please sign in again.",
      signed_out: "You are signed out.",
      unknown_error: "Something went wrong. Please try again shortly.",
    },
  },
}

export const isMessageCode = (value: unknown): value is MessageCode =>
  typeof value === "string" && value in MESSAGES.da.codes
