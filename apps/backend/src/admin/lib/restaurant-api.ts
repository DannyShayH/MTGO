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
}
export type AddressWarning = {
  code: "same_pickup_address"
  restaurant_ids: string[]
}
export type RestaurantResponse = {
  restaurant: Restaurant
  warnings: AddressWarning[]
}
export const restaurantMessages: Record<string, string> = {
  same_pickup_address:
    "Another Restaurant has this pickup address. You can still save separate kitchens at the same address.",
  restaurant_inactive: "Restaurant is inactive",
  restaurant_closed: "Restaurant is closed",
  delivery_area_missing: "No delivery area",
  destination_not_served: "Destination is outside the delivery area",
}
export const restaurantFields = [
  { key: "name", label: "Name", type: "text" },
  { key: "address_street", label: "Pickup street", type: "text" },
  { key: "address_postal_code", label: "Pickup postal code", type: "text" },
  { key: "address_city", label: "Pickup city", type: "text" },
  { key: "contact_phone", label: "Contact phone", type: "tel" },
  { key: "contact_email", label: "Contact email", type: "email" },
] as const
