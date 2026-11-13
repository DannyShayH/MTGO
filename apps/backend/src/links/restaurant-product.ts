import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import RestaurantModule from "../modules/restaurant"

/** A Restaurant's dishes are products, as in Medusa's Restaurant-Delivery Marketplace recipe. */
export default defineLink(RestaurantModule.linkable.restaurant, {
  linkable: ProductModule.linkable.product,
  isList: true,
})
