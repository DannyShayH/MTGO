import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import OrderOperationModule from "../modules/order-operation"

/**
 * Read-only, one-to-one: `order.order_operation` is the record whose
 * `order_id` names the Order. Creating the record is the write that places a
 * paid Order, so there is no separate link row to keep in step. Order lists
 * filter on the record id copied into Order metadata (#154).
 */
export default defineLink(
  { linkable: OrderModule.linkable.order, field: "id" },
  {
    ...OrderOperationModule.linkable.orderOperation.id,
    primaryKey: "order_id",
  },
  { readOnly: true },
)
