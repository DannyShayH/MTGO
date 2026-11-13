import Medusa from "@medusajs/js-sdk"

export const sdk = new Medusa({ baseUrl: "/", auth: { type: "session" } })
export type RestaurantDetails = {
  name: string
  address_street: string
  address_postal_code: string
  address_city: string
  contact_phone: string
  contact_email: string
}
export type Restaurant = RestaurantDetails & {
  id: string
  is_active: boolean
  is_open: boolean
  receiving_new_orders: boolean
  reason: string | null
  delivery_area_postal_codes: string[]
}
export type RegisteredPostalCode = {
  postal_code: string
  name: string
  municipality: string
}
export type CommissionTier = {
  from_amount: number
  to_amount: number | null
  rate_percent: number
}
export type CommercialTerms = {
  terms_version: string
  commission_tiers: CommissionTier[]
  monthly_service_fee: { amount: number; currency_code: string }
  agreement: {
    terms_version: string
    agreed_at: string
    recorded_by: { id: string; email: string | null }
  } | null
}
export type Readiness = {
  can_activate: boolean
  requirements: { code: string; missing: boolean }[]
}
export type StaffMember = {
  id: string
  name: string
  email: string
  status: "pending" | "authorized" | "revoked"
  invited_by: string | null
  created_at: string
  accepted_at: string | null
  revoked_at: string | null
  revoked_by: { id: string; email: string | null } | null
  invitation: { expires_at: string; invite_link: string } | null
  /** Only on authorized staff: confirm these before revoking. */
  revoke_warnings?: "last_authorized_staff"[]
}
export type RestaurantStaffGroups = {
  pending: StaffMember[]
  authorized: StaffMember[]
  former: StaffMember[]
}
export type IssuedStaffInvitation = {
  staff_id: string
  expires_at: string
  invite_link: string
}
export type StaffInvitationResponse = {
  staff: Pick<StaffMember, "id" | "name" | "email" | "status">
  invitation: IssuedStaffInvitation
  restaurant: RestaurantDetail
}
export type RestaurantDetail = Restaurant & {
  staff: RestaurantStaffGroups
  delivery_area: { postal_code: string; name: string | null }[]
  commercial_terms: CommercialTerms
  menu: { published_dish_count: number }
  readiness: Readiness
}
export type AddressWarning = {
  code: "same_pickup_address"
  restaurant_ids: string[]
}
export type RestaurantResponse = {
  restaurant: RestaurantDetail
  warnings: AddressWarning[]
}
export type RestaurantDetailResponse = { restaurant: RestaurantDetail }
export type HistoryEntry = {
  id: string
  kind: "activated" | "deactivated" | "opened" | "closed"
  occurred_at: string
  actor_type: "user" | "restaurant_staff"
  actor_id: string
  actor_name: string
  reason: string | null
}
export type RestaurantHistoryResponse = {
  history: HistoryEntry[]
  count: number
  limit: number
  offset: number
}
export const historyKindLabels: Record<HistoryEntry["kind"], string> = {
  activated: "Activated",
  deactivated: "Deactivated",
  opened: "Opened",
  closed: "Closed",
}
/**
 * The missing requirement codes a refused activation names. The SDK passes on
 * only the error's message, and the message lists the codes.
 */
export const missingRequirementsIn = (message: string) =>
  message.startsWith("activation_requirements_missing")
    ? Object.keys(requirementLabels).filter((code) => message.includes(code))
    : []
export const restaurantMessages: Record<string, string> = {
  same_pickup_address:
    "Another Restaurant has this pickup address. You can still save separate kitchens at the same address.",
  restaurant_inactive: "Restaurant is inactive",
  restaurant_closed: "Restaurant is closed",
  delivery_area_missing: "No delivery area",
  destination_not_served: "Destination is outside the delivery area",
  email_has_login:
    "This email already has an MTOGO login or belongs to Restaurant staff. Ask the person for a different email.",
  staff_invitation_not_found:
    "This invitation no longer exists. Reload to see the current staff.",
  last_postal_code_while_active:
    "An active Restaurant must keep at least one postal code. Deactivate it first to remove the last one.",
  commercial_terms_required_while_active:
    "An active Restaurant must keep its commercial terms. Deactivate it first to remove them.",
  deactivation_reason_required: "Enter a reason for the deactivation.",
  last_authorized_staff:
    "This is the last authorized staff member. Afterwards nobody can open the Restaurant or accept Orders. Consider deactivating the Restaurant instead.",
}
export const termsVersionNames: Record<string, string> = {
  common_mvp_v1: "Common MVP terms v1",
}
/** Checklist labels for the activation requirement codes (ADR-0018: English only). */
export const requirementLabels: Record<string, string> = {
  pickup_address_missing: "Pickup address",
  contacts_missing: "Contact phone and email",
  authorized_staff_missing: "Authorized staff",
  commercial_terms_missing: "Commercial terms",
  published_menu_missing: "Published menu",
  delivery_area_missing: "Delivery area",
}
export const restaurantFields = [
  { key: "name", label: "Name", type: "text" },
  { key: "address_street", label: "Pickup street", type: "text" },
  { key: "address_postal_code", label: "Pickup postal code", type: "text" },
  { key: "address_city", label: "Pickup city", type: "text" },
  { key: "contact_phone", label: "Contact phone", type: "tel" },
  { key: "contact_email", label: "Contact email", type: "email" },
] as const
