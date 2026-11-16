import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import RestaurantModule from "../modules/restaurant"

/** Each placed Order has one Restaurant; a Restaurant has many Orders. */
export default defineLink(RestaurantModule.linkable.restaurant, {
  linkable: OrderModule.linkable.order,
  isList: true,
})
