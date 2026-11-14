import { MedusaService } from "@medusajs/framework/utils"
import Allergen from "./models/allergen"
import AllergenDetail from "./models/allergen-detail"
import FoodLabel from "./models/food-label"

class FoodCatalogueModuleService extends MedusaService({
  Allergen,
  AllergenDetail,
  FoodLabel,
}) {}
export default FoodCatalogueModuleService
