import { model } from "@medusajs/framework/utils"

/**
 * The outstanding conditions an operator must notice (spec #48 stories 42,
 * 48-50). `access_revoked` (#159) is raised at once when an operator revokes
 * an agent who still holds a delivery. `assigned_without_pickup` and
 * `in_transit_without_delivery` (#163) are stalled assigned work, due at
 * acceptance or pickup plus thirty minutes. `arrived_without_handover`
 * (#164) is an unreachable Customer: no handover ten minutes after the
 * agent's explicit arrival.
 */
export const ATTENTION_TYPES = [
  "unassigned",
  "access_revoked",
  "assigned_without_pickup",
  "in_transit_without_delivery",
  "arrived_without_handover",
  "agent_reported_problem",
] as const
export type AttentionType = (typeof ATTENTION_TYPES)[number]

export const PROBLEM_CATEGORIES = [
  "restaurant_unavailable",
  "food_missing_or_wrong",
  "address_not_found",
  "other",
] as const
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number]

/** Why an attention stopped being outstanding. It never changes the Order. */
export const ATTENTION_RESOLUTIONS = [
  "assigned",
  "picked_up",
  "delivered",
  "order_ended",
] as const
export type AttentionResolution = (typeof ATTENTION_RESOLUTIONS)[number]

/**
 * One durable attention obligation per Order and condition (#158). It is
 * stored when its condition begins, with the effective deadline `due_at`
 * derived from a durable business time. A sweep raises it once due, recording
 * its own processing time in `raised_at` and never moving `due_at`, so
 * downtime and repeated sweeps neither reset the clock nor duplicate it.
 */
const DeliveryAttention = model
  .define("delivery_attention", {
    id: model.id({ prefix: "datt" }).primaryKey(),
    order_id: model.text(),
    type: model.enum([...ATTENTION_TYPES]),
    due_at: model.dateTime(),
    raised_at: model.dateTime().nullable(),
    resolved_at: model.dateTime().nullable(),
    resolution: model.enum([...ATTENTION_RESOLUTIONS]).nullable(),
    category: model.enum([...PROBLEM_CATEGORIES]).nullable(),
    note: model.text().nullable(),
    reported_by: model.text().nullable(),
  })
  .indexes([
    // One obligation per Order and condition, however often it is scheduled.
    { on: ["order_id", "type"], unique: true },
    // The sweep reads outstanding obligations in due order.
    { on: ["due_at", "id"], where: "resolved_at IS NULL" },
  ])

export default DeliveryAttention
