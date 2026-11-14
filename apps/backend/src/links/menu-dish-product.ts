import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import RestaurantModule from "../modules/restaurant"

/** One product carries one dish's Restaurant-owned content; removing the product removes it. */
export default defineLink(ProductModule.linkable.product, {
  linkable: RestaurantModule.linkable.menuDish,
  deleteCascade: true,
})
