import { MedusaService } from "@medusajs/framework/utils"
import Restaurant, {
  CommercialTermsAgreement,
  DeliveryAreaPostalCode,
} from "./models/restaurant"

class RestaurantModuleService extends MedusaService({
  Restaurant,
  DeliveryAreaPostalCode,
  CommercialTermsAgreement,
}) {}

export default RestaurantModuleService
