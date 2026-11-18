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
 * Why an Order was cancelled before acceptance (spec #47). Each names its
 * actor type: Restaurant staff, the system at the deadline, or the Customer.
 */
export const CANCELLATION_CATEGORIES = [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
] as const
export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number]

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
    /**
     * The kitchen milestones (#146): each records its actual server time and
     * the staff member who recorded it, and is never moved or undone.
     */
    preparation_started_at: model.dateTime().nullable(),
    preparation_started_by: model.text().nullable(),
    ready_at: model.dateTime().nullable(),
    ready_by: model.text().nullable(),
    /**
     * The business cancellation (#143): actual server time, actor (staff or
     * Customer id, or `system`), category and an optional internal note.
     * Authoritative even while native commerce cancellation is pending.
     */
    cancelled_at: model.dateTime().nullable(),
    cancelled_by: model.text().nullable(),
    cancellation_category: model.enum([...CANCELLATION_CATEGORIES]).nullable(),
    cancellation_note: model.text().nullable(),
    /** When native Order cancellation, reservations and payment collection were synchronized. */
    native_cancelled_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["restaurant_id", "state", "acceptance_deadline", "id"] },
    { on: ["restaurant_id", "state", "placed_at", "id"] },
    // The kitchen feed's bounded read of recently changed records (#148).
    { on: ["restaurant_id", "updated_at"] },
  ])

export default OrderOperation
