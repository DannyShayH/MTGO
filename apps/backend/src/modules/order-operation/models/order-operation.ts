import { model } from "@medusajs/framework/utils"

/** The initial operational states (spec #47); none implies pickup or delivery. */
export const ORDER_OPERATION_STATES = [
  "awaiting_acceptance",
  "accepted",
  "preparing",
  "ready",
  "cancelled",
] as const
export type OrderOperationState = (typeof ORDER_OPERATION_STATES)[number]

/**
 * One per paid Order: its existence is the immutable paid-placement fact.
 * `order_id` and `restaurant_id` never change after creation. A legacy Order
 * placed before this record existed has no `placed_at` or deadline.
 */
const OrderOperation = model
  .define("order_operation", {
    id: model.id({ prefix: "ordop" }).primaryKey(),
    order_id: model.text(),
    restaurant_id: model.text(),
    placed_at: model.dateTime().nullable(),
    acceptance_deadline: model.dateTime().nullable(),
    state: model
      .enum([...ORDER_OPERATION_STATES])
      .default("awaiting_acceptance"),
    revision: model.number().default(1),
    /**
     * The purchased kitchen facts copied from the cart's frozen purchase
     * review at placement and never changed. Null when placement predates
     * them, so the kitchen shows them as unavailable instead of today's menu.
     */
    purchased_items: model.json().nullable(),
    /** The acceptance milestone: actual server time and the accepting staff member. */
    accepted_at: model.dateTime().nullable(),
    accepted_by: model.text().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["restaurant_id", "state", "acceptance_deadline", "id"] },
    { on: ["restaurant_id", "state", "placed_at", "id"] },
    // The kitchen feed's bounded read of recently changed records (#148).
    { on: ["restaurant_id", "updated_at"] },
  ])

export default OrderOperation
