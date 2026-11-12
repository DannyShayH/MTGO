import { MedusaService } from "@medusajs/framework/utils"
import Restaurant, {
  CommercialTermsAgreement,
  DeliveryAreaPostalCode,
  RestaurantStaff,
} from "./models/restaurant"

class RestaurantModuleService extends MedusaService({
  Restaurant,
  DeliveryAreaPostalCode,
  CommercialTermsAgreement,
  RestaurantStaff,
}) {}

export default RestaurantModuleService
