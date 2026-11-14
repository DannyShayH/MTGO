import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import RestaurantModule from "../modules/restaurant"

/** Many dishes in a category; a dish has only one category. */
export default defineLink(RestaurantModule.linkable.menuCategory, {
  linkable: ProductModule.linkable.product,
  isList: true,
})
