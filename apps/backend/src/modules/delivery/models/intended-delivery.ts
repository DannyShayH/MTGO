import { model } from "@medusajs/framework/utils"

/** How a responsibility was established: an agent's claim or an operator's initial assignment. */
export const ASSIGNMENT_SOURCES = [
  "agent_claim",
  "operator_assignment",
] as const
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number]

/**
 * One accepted Order's immutable pickup and destination facts, and its one
 * responsible agent (#157). `assigned_agent_id` is the historical
 * responsibility and never changes once set; `active_agent_id` is the
 * agent's active-capacity hold, unique per agent, released only by a later
 * terminal outcome.
 */
const IntendedDelivery = model
  .define("intended_delivery", {
    id: model.id({ prefix: "idel" }).primaryKey(),
    order_id: model.text(),
    restaurant_id: model.text(),
    restaurant_name: model.text(),
    pickup_address: model.text(),
    pickup_postal_code: model.text(),
    destination_postal_code: model.text(),
    order_reference: model.number(),
    accepted_at: model.dateTime(),
    claim_deadline: model.dateTime(),
    assigned_agent_id: model.text().nullable(),
    active_agent_id: model.text().nullable(),
    assigned_at: model.dateTime().nullable(),
    /** The authenticated actor: the claiming agent, or the assigning operator (user id). */
    assigned_by: model.text().nullable(),
    assignment_source: model.enum([...ASSIGNMENT_SOURCES]).nullable(),
    /** The retry identity of the request that established the assignment. */
    assignment_request_id: model.text().nullable(),
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["assigned_agent_id", "accepted_at", "id"] },
    // At most one active delivery per agent, enforced by the database.
    {
      on: ["active_agent_id"],
      unique: true,
      where: "active_agent_id IS NOT NULL",
    },
    {
      on: ["assignment_request_id"],
      unique: true,
      where: "assignment_request_id IS NOT NULL",
    },
  ])

export default IntendedDelivery
