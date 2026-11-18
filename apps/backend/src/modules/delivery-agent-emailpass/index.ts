import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import DeliveryAgentEmailPassService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [DeliveryAgentEmailPassService],
})
