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
 * Why an Order was cancelled (spec #47, #48, #49). Each names its actor
 * type: Restaurant staff, the system at the acceptance deadline, the
 * Customer, the system when accepted work was still unassigned thirty
 * minutes after acceptance (#162), or an MTOGO operator after acceptance
 * (#199), always with a full refund.
 */
export const CANCELLATION_CATEGORIES = [
  "restaurant_rejected",
  "acceptance_timeout",
  "customer_cancelled",
  "unassigned_timeout",
  "operator_cancelled",
] as const
export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number]

/**
 * How the Order's delivery ended, as the kitchen sees it (#204): the food was
 * handed over, or the delivery ended without it (cancelled or failed).
 */
export const DELIVERY_OUTCOMES = ["delivered", "not_delivered"] as const
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number]

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
    /**
     * The purchased financial basis frozen at paid placement (#226): agreed
     * terms with their VAT and commission inputs, the Order version and each
     * line's exact price and quantity. Never changed; null for Orders placed
     * before it was recorded, which show it as unavailable.
     */
    financial_basis: model.json().nullable(),
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
    /**
     * The end of the Order's delivery (#204), copied once from the delivery's
     * terminal outcome and time and never moved. Null while the delivery has
     * not ended. Separate from `state`, which ends with the kitchen at `ready`.
     */
    delivery_outcome: model.enum([...DELIVERY_OUTCOMES]).nullable(),
    delivery_ended_at: model.dateTime().nullable(),
    /**
     * The Delivery agent's pickup (#254), copied once from the delivery's
     * `picked_up_at` and never moved. Only the time: who collected the food
     * stays with the delivery (ADR-0008).
     */
    delivery_picked_up_at: model.dateTime().nullable(),
    /**
     * When a Delivery agent became responsible for the Order's delivery
     * (#259), copied once from the delivery's `assigned_at` and never moved.
     * Only the time: who is responsible stays with the delivery (ADR-0008).
     * It lets the Open Order stages come from this record alone.
     */
    delivery_assigned_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["restaurant_id", "state", "acceptance_deadline", "id"] },
    { on: ["restaurant_id", "state", "placed_at", "id"] },
    // The kitchen feed's bounded read of recently changed records (#148).
    { on: ["restaurant_id", "updated_at"] },
    // Placements in the last 24 hours and seven days (#261), platform-wide.
    { on: ["placed_at"], where: "placed_at IS NOT NULL" },
    // Open Orders by stage (#259): only work that has not ended.
    {
      on: ["restaurant_id", "state"],
      where: "state <> 'cancelled' AND delivery_outcome IS NULL",
    },
  ])

export default OrderOperation
