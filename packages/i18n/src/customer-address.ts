import type { Locale } from "./locale.ts"
import { validateCustomerPhone } from "./customer-profile.ts"

export type CustomerAddressError =
  | "customer_address_name_required"
  | "customer_address_street_required"
  | "customer_address_postal_code_invalid"
  | "customer_address_city_required"
  | "customer_address_country_invalid"
  | "customer_address_phone_invalid"

export type CustomerAddressText = {
  title: string
  description: string
  newAddress: string
  addAddress: string
  editAddress: string
  firstName: string
  lastName: string
  company: string
  street: string
  apartment: string
  postalCode: string
  city: string
  province: string
  phone: string
  setDefault: string
  defaultAddress: string
  makeDefault: string
  removeDefault: string
  save: string
  cancel: string
  edit: string
  remove: string
  nameRequired: string
  streetRequired: string
  postalCodeInvalid: string
  cityRequired: string
  countryInvalid: string
  phoneInvalid: string
  genericError: string
}

export const CUSTOMER_ADDRESS_TEXT: Record<Locale, CustomerAddressText> = {
  da: {
    title: "Leveringsadresser",
    description:
      "Gem flere adresser, så du hurtigt kan vælge en ved bestilling.",
    newAddress: "Ny adresse",
    addAddress: "Tilføj adresse",
    editAddress: "Rediger adresse",
    firstName: "Fornavn",
    lastName: "Efternavn",
    company: "Virksomhed",
    street: "Gade og husnummer",
    apartment: "Lejlighed eller etage",
    postalCode: "Postnummer",
    city: "By",
    province: "Region",
    phone: "Telefon",
    setDefault: "Gør denne til min standardadresse",
    defaultAddress: "Standardadresse",
    makeDefault: "Gør til standard",
    removeDefault: "Fjern som standard",
    save: "Gem adresse",
    cancel: "Annuller",
    edit: "Rediger",
    remove: "Slet",
    nameRequired: "Indtast både fornavn og efternavn.",
    streetRequired: "Indtast gade og husnummer, f.eks. Testvej 12.",
    postalCodeInvalid: "Indtast et dansk postnummer med fire cifre.",
    cityRequired: "Indtast en by.",
    countryInvalid: "Vælg Danmark som land for leveringsadressen.",
    phoneInvalid:
      "Indtast et gyldigt mobilnummer med landekode, f.eks. +45 12 34 56 78.",
    genericError: "Adressen kunne ikke gemmes. Prøv igen.",
  },
  en: {
    title: "Delivery addresses",
    description: "Save multiple addresses so you can choose one at checkout.",
    newAddress: "New address",
    addAddress: "Add address",
    editAddress: "Edit address",
    firstName: "First name",
    lastName: "Last name",
    company: "Company",
    street: "Street and house number",
    apartment: "Apartment or floor",
    postalCode: "Postal code",
    city: "City",
    province: "Province / state",
    phone: "Phone",
    setDefault: "Make this my default address",
    defaultAddress: "Default address",
    makeDefault: "Make default",
    removeDefault: "Remove as default",
    save: "Save address",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    nameRequired: "Enter both a first and last name.",
    streetRequired: "Enter a street and house number, for example Testvej 12.",
    postalCodeInvalid: "Enter a four-digit Danish postal code.",
    cityRequired: "Enter a city.",
    countryInvalid: "Choose Denmark as the delivery country.",
    phoneInvalid:
      "Enter a valid mobile number with a country code, for example +45 12 34 56 78.",
    genericError: "We could not save the address. Please try again.",
  },
}

export const validateCustomerAddress = (address: {
  first_name: string
  last_name: string
  address_1: string
  postal_code: string
  city: string
  country_code: string
  phone: string
}): CustomerAddressError | null => {
  const normalizedStreet = address.address_1.trim().replace(/\s+/g, " ")
  const houseNumberIndex = normalizedStreet.search(/ \d/)
  const streetName =
    houseNumberIndex === -1 ? "" : normalizedStreet.slice(0, houseNumberIndex)
  const houseNumber =
    houseNumberIndex === -1 ? "" : normalizedStreet.slice(houseNumberIndex + 1)

  if (!address.first_name.trim() || !address.last_name.trim()) {
    return "customer_address_name_required"
  }
  if (
    !/^[A-Za-zÆØÅæøå]/.test(streetName) ||
    !/[A-Za-zÆØÅæøå.'-]/.test(streetName) ||
    !/^\d+[A-Za-z]?([-/]\d+[A-Za-z]?)?$/.test(houseNumber)
  ) {
    return "customer_address_street_required"
  }
  if (!/^\d{4}$/.test(address.postal_code.trim())) {
    return "customer_address_postal_code_invalid"
  }
  if (!address.city.trim()) return "customer_address_city_required"
  if (address.country_code.toLowerCase() !== "dk") {
    return "customer_address_country_invalid"
  }
  if (validateCustomerPhone(address.phone)) {
    return "customer_address_phone_invalid"
  }
  return null
}

export const customerAddressErrorMessage = (
  error: string | null,
  text: CustomerAddressText,
): string => {
  switch (error) {
    case "customer_address_name_required":
      return text.nameRequired
    case "customer_address_street_required":
      return text.streetRequired
    case "customer_address_postal_code_invalid":
      return text.postalCodeInvalid
    case "customer_address_city_required":
      return text.cityRequired
    case "customer_address_country_invalid":
      return text.countryInvalid
    case "customer_address_phone_invalid":
      return text.phoneInvalid
    default:
      return text.genericError
  }
}
