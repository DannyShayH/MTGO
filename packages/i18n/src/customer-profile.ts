import type { Locale } from "./locale.ts"

export type CustomerProfileError =
  | "customer_name_required"
  | "customer_phone_invalid"
  | "customer_profile_input_invalid"

export const ACCOUNT_INFO_TEXT = {
  da: {
    edit: "Rediger",
    cancel: "Annuller",
    save: "Gem ændringer",
    updated: "Oplysningerne er opdateret.",
  },
  en: {
    edit: "Edit",
    cancel: "Cancel",
    save: "Save changes",
    updated: "Information updated.",
  },
} satisfies Record<
  Locale,
  Record<"edit" | "cancel" | "save" | "updated", string>
>

type CustomerProfileText = Record<
  | "name"
  | "first_name"
  | "last_name"
  | "phone"
  | "delivery_contact_help"
  | "sms_help"
  | "edit"
  | "cancel"
  | "save"
  | "updated"
  | "name_required"
  | "phone_invalid"
  | "generic_error"
  | "email_change_title"
  | "email_change_password"
  | "email_change_new_email"
  | "email_change_submit"
  | "email_change_sent"
  | "email_change_password_invalid"
  | "email_change_unavailable"
  | "email_change_error"
  | "email_change_confirmed"
  | "email_change_link_invalid"
  | "email_change_sign_in",
  string
>

export const CUSTOMER_PROFILE_TEXT: Record<Locale, CustomerProfileText> = {
  da: {
    ...ACCOUNT_INFO_TEXT.da,
    name: "Navn",
    first_name: "Fornavn",
    last_name: "Efternavn",
    phone: "Mobilnummer",
    delivery_contact_help: "Vi bruger nummeret som kontakt til din levering.",
    sms_help: "Det kan også bruges til beskeder om din bestilling.",
    updated: "Navn og kontaktoplysninger er opdateret.",
    name_required: "Indtast både fornavn og efternavn.",
    phone_invalid:
      "Indtast et gyldigt mobilnummer med landekode, f.eks. +45 12 34 56 78.",
    generic_error: "Profilen kunne ikke opdateres. Prøv igen.",
    email_change_title: "Skift e-mail",
    email_change_password: "Nuværende adgangskode",
    email_change_new_email: "Ny e-mail",
    email_change_submit: "Send bekræftelseslink",
    email_change_sent:
      "Tjek din nye indbakke for at bekræfte e-mailændringen. Din nuværende login-e-mail virker stadig indtil da.",
    email_change_password_invalid: "Den nuværende adgangskode er forkert.",
    email_change_unavailable: "Den e-mail kan ikke bruges til en kundekonto.",
    email_change_error: "E-mailændringen kunne ikke startes. Prøv igen.",
    email_change_confirmed:
      "Din login-e-mail er ændret. Log ind med den nye e-mail næste gang.",
    email_change_link_invalid:
      "Dette link til e-mailændring er ugyldigt, udløbet eller allerede brugt.",
    email_change_sign_in: "Gå til login",
  },
  en: {
    ...ACCOUNT_INFO_TEXT.en,
    name: "Name",
    first_name: "First name",
    last_name: "Last name",
    phone: "Mobile number",
    delivery_contact_help: "We use this number to contact you about delivery.",
    sms_help: "It may also be used for messages about your order.",
    updated: "Name and contact details updated.",
    name_required: "Enter both your first and last name.",
    phone_invalid:
      "Enter a valid mobile number with a country code, for example +45 12 34 56 78.",
    generic_error: "We could not update your profile. Please try again.",
    email_change_title: "Change email",
    email_change_password: "Current password",
    email_change_new_email: "New email",
    email_change_submit: "Send confirmation link",
    email_change_sent:
      "Check your new inbox to confirm the email change. Your current login email keeps working until then.",
    email_change_password_invalid: "The current password is incorrect.",
    email_change_unavailable:
      "That email cannot be used for a Customer account.",
    email_change_error:
      "We could not start the email change. Please try again.",
    email_change_confirmed:
      "Your login email has changed. Sign in with the new email on your next visit.",
    email_change_link_invalid:
      "This email-change link is invalid, expired or has already been used.",
    email_change_sign_in: "Go to sign in",
  },
}

export const isCustomerProfileError = (
  value: unknown,
): value is CustomerProfileError =>
  typeof value === "string" &&
  (value === "customer_name_required" ||
    value === "customer_phone_invalid" ||
    value === "customer_profile_input_invalid")

export const validateCustomerName = (
  firstName: string,
  lastName: string,
): CustomerProfileError | null =>
  firstName.trim().length > 0 && lastName.trim().length > 0
    ? null
    : "customer_name_required"

/** Accepts international, country-code-prefixed numbers in common display formats. */
export const validateCustomerPhone = (
  phone: string,
): CustomerProfileError | null => {
  const compact = phone.trim().replace(/[\s()-]/g, "")
  return /^\+[1-9]\d{7,14}$/.test(compact) && !compact.startsWith("+999")
    ? null
    : "customer_phone_invalid"
}
