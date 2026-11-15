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
  | "generic_error",
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
