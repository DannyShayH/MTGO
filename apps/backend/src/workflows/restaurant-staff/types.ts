export type AuthorizedStaff = {
  staff: {
    id: string
    name: string
    email: string
    status: "authorized"
    restaurant_id: string
  }
  restaurant: { id: string; name: string }
}
