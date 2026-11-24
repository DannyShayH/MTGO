import { Module } from "@medusajs/framework/utils"
import RestaurantFinanceModuleService from "./service"

export const RESTAURANT_FINANCE_MODULE = "restaurantFinance"
export default Module(RESTAURANT_FINANCE_MODULE, {
  service: RestaurantFinanceModuleService,
})
