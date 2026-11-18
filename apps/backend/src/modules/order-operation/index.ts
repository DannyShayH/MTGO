import { Module } from "@medusajs/framework/utils"
import OrderOperationModuleService from "./service"

export const ORDER_OPERATION_MODULE = "orderOperations"
export default Module(ORDER_OPERATION_MODULE, {
  service: OrderOperationModuleService,
})
