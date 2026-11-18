import { MedusaService } from "@medusajs/framework/utils"
import OrderOperation from "./models/order-operation"

class OrderOperationModuleService extends MedusaService({ OrderOperation }) {}

export default OrderOperationModuleService
