import { Module } from "@medusajs/framework/utils"
import FoodCatalogueModuleService from "./service"

export const FOOD_CATALOGUE_MODULE = "foodCatalogue"
export default Module(FOOD_CATALOGUE_MODULE, {
  service: FoodCatalogueModuleService,
})
