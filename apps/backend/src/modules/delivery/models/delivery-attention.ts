import { model } from "@medusajs/framework/utils"

/**
 * The outstanding conditions an operator must notice (spec #48 stories 42,
 * 48). Later slices add assigned-without-pickup, in-transit, unreachable
 * recipient conditions to the same record. `access_revoked` (#159) is raised
 * at once when an operator revokes an agent who still holds a delivery.
 */
export const ATTENTION_TYPES = ["unassigned", "access_revoked"] as const
export type AttentionType = (typeof ATTENTION_TYPES)[number]

/** Why an attention stopped being outstanding. It never changes the Order. */
export const ATTENTION_RESOLUTIONS = ["assigned", "order_ended"] as const
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
  })
  .indexes([
    // One obligation per Order and condition, however often it is scheduled.
    { on: ["order_id", "type"], unique: true },
    // The sweep reads outstanding obligations in due order.
    { on: ["due_at", "id"], where: "resolved_at IS NULL" },
  ])

export default DeliveryAttention
