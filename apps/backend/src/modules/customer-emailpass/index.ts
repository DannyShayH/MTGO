import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CustomerEmailPassService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [CustomerEmailPassService],
})
