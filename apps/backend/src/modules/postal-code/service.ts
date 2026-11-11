import { MedusaService } from "@medusajs/framework/utils"
import PostalCode from "./models/postal-code"

class PostalCodeModuleService extends MedusaService({ PostalCode }) {}

export default PostalCodeModuleService
