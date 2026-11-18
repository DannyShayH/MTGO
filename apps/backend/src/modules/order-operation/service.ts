import { MedusaService } from "@medusajs/framework/utils"
import OrderOperation from "./models/order-operation"
import PurchaseReview from "./models/purchase-review"

class OrderOperationModuleService extends MedusaService({
  OrderOperation,
  PurchaseReview,
}) {}

export default OrderOperationModuleService
