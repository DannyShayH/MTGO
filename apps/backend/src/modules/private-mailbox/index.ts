import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PrivateMailboxService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [PrivateMailboxService],
})
