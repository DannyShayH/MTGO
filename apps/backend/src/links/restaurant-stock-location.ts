import { defineLink } from "@medusajs/framework/utils"
import StockLocationModule from "@medusajs/medusa/stock-location"
import RestaurantModule from "../modules/restaurant"

/** One Restaurant location has one native stock location for pickup fulfillment. */
export default defineLink(
  RestaurantModule.linkable.restaurant,
  StockLocationModule.linkable.stockLocation,
)
