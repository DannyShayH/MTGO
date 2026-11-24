import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import FeedbackModule from "../modules/feedback"

/**
 * Read-only, one-to-one: `order.feedback` is the Feedback whose `order_id`
 * names the Order (#218), as for the Order's operation record. Recording the
 * Feedback is the only write, so there is no link row to keep in step.
 */
export default defineLink(
  { linkable: OrderModule.linkable.order, field: "id" },
  {
    ...FeedbackModule.linkable.feedback.id,
    primaryKey: "order_id",
  },
  { readOnly: true },
)
