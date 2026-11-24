import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import RestaurantFinanceModule from "../modules/restaurant-finance"

/**
 * Read-only: `order.finance_receipt` is the Restaurant finance recognition
 * whose `order_id` names the Order (#227). Recording the receipt is the only
 * write, so there is no link row to keep in step, and removing operational
 * data never cascades into financial history.
 */
export default defineLink(
  { linkable: OrderModule.linkable.order, field: "id" },
  {
    ...RestaurantFinanceModule.linkable.financeReceipt.id,
    primaryKey: "order_id",
  },
  { readOnly: true },
)
