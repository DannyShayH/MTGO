export const ACTIVATION_REQUIREMENT_CODES = [
  "pickup_address_missing",
  "contacts_missing",
  "authorized_staff_missing",
  "commercial_terms_missing",
  "published_menu_missing",
  "delivery_area_missing",
] as const
export type ActivationRequirementCode =
  (typeof ACTIVATION_REQUIREMENT_CODES)[number]

export type ActivationFacts = {
  address_street: string
  address_postal_code: string
  address_city: string
  contact_phone: string
  contact_email: string
  authorized_staff_count: number
  has_commercial_terms: boolean
  published_dish_count: number
  delivery_area_postal_code_count: number
}

const present = (...values: string[]) =>
  values.every((value) => value.trim().length > 0)

/** Missing activation requirements in checklist order; empty when activation may proceed (ADR-0008). */
export function evaluateActivationRequirements(
  facts: ActivationFacts,
): ActivationRequirementCode[] {
  const met: Record<ActivationRequirementCode, boolean> = {
    pickup_address_missing: present(
      facts.address_street,
      facts.address_postal_code,
      facts.address_city,
    ),
    contacts_missing: present(facts.contact_phone, facts.contact_email),
    authorized_staff_missing: facts.authorized_staff_count > 0,
    commercial_terms_missing: facts.has_commercial_terms,
    published_menu_missing: facts.published_dish_count > 0,
    delivery_area_missing: facts.delivery_area_postal_code_count > 0,
  }
  return ACTIVATION_REQUIREMENT_CODES.filter((code) => !met[code])
}
