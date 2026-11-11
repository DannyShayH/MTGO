export type RestaurantDetails = {
  name: string
  address_street: string
  address_postal_code: string
  address_city: string
  contact_phone: string
  contact_email: string
}
export type AddressWarning = {
  code: "same_pickup_address"
  restaurant_ids: string[]
}
