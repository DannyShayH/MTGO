import { Module } from "@medusajs/framework/utils"
import RestaurantModuleService from "./service"

export const RESTAURANT_MODULE = "restaurant"
export default Module(RESTAURANT_MODULE, { service: RestaurantModuleService })
