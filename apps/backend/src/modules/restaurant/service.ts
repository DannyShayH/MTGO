import { MedusaService } from "@medusajs/framework/utils"
import Restaurant from "./models/restaurant"

class RestaurantModuleService extends MedusaService({ Restaurant }) {}

export default RestaurantModuleService
