import { model } from "@medusajs/framework/utils"

/** How a responsibility was established: an agent's claim or an operator's initial assignment. */
export const ASSIGNMENT_SOURCES = [
  "agent_claim",
  "operator_assignment",
] as const
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number]

/**
 * How a delivery ended (#161): the agent's confirmed handover, the Order's
 * authoritative cancellation, or an operator-confirmed failure (#49).
 */
export const TERMINAL_OUTCOMES = ["delivered", "cancelled", "failed"] as const
export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number]

/**
 * One accepted Order's immutable pickup and destination facts, and its one
 * responsible agent (#157). `assigned_agent_id` is the historical
 * responsibility and never changes once set; `active_agent_id` is the
 * agent's active-capacity hold, unique per agent, released only by the
 * terminal outcome (#161).
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
    /**
     * The pickup milestone (#160): the server time the responsible agent
     * confirmed collecting ready food, recorded once and never moved.
     */
    picked_up_at: model.dateTime().nullable(),
    picked_up_by: model.text().nullable(),
    /** The retry identity of the request that recorded pickup. */
    pickup_request_id: model.text().nullable(),
    /**
     * The native Order fulfillment created and shipped for this pickup. Null
     * after pickup means the native synchronization is still owed.
     */
    native_fulfillment_id: model.text().nullable(),
    /**
     * When the owed native synchronization was last queued: the pickup
     * time, then each attempt's start. The recovery sweep takes the oldest
     * first, so a lasting failure cannot hold back newer pickups.
     */
    native_sync_queued_at: model.dateTime().nullable(),
    /**
     * The arrival milestone (#164): the server time the responsible agent
     * explicitly recorded reaching the destination, once and never moved.
     * It starts the unreachable-Customer clock; no location creates it and
     * handover never requires it.
     */
    arrived_at: model.dateTime().nullable(),
    arrived_by: model.text().nullable(),
    /** The retry identity of the request that recorded arrival. */
    arrival_request_id: model.text().nullable(),
    /**
     * The trip (#191), measured once after acceptance: geocoded pickup and
     * destination, and the route distance rounded to 100 m. The destination
     * coordinates never leave the backend. `trip_measured_at` marks the one
     * attempt, so a retry never calls the provider again; null distance
     * after it (or on legacy work) shows as unavailable.
     */
    pickup_latitude: model.float().nullable(),
    pickup_longitude: model.float().nullable(),
    destination_latitude: model.float().nullable(),
    destination_longitude: model.float().nullable(),
    trip_distance_m: model.number().nullable(),
    trip_measured_at: model.dateTime().nullable(),
    /**
     * The terminal outcome (#161), recorded once with its server time and
     * actor (the delivering agent, an operator, a Customer or `system`) and
     * never replaced. It releases `active_agent_id` in the same write; the
     * assignment and earlier milestones stay as they were.
     */
    terminal_outcome: model.enum([...TERMINAL_OUTCOMES]).nullable(),
    terminal_at: model.dateTime().nullable(),
    terminal_by: model.text().nullable(),
    /** The retry identity of the handover request that delivered the work. */
    handover_request_id: model.text().nullable(),
    /** When the native fulfillment was marked delivered after handover. */
    native_delivered_at: model.dateTime().nullable(),
    /**
     * When the terminal outcome was recorded on the Order's kitchen record
     * (#204). Null after the terminal outcome means it is still owed, and
     * the recovery sweep records it.
     */
    order_outcome_recorded_at: model.dateTime().nullable(),
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
    {
      on: ["pickup_request_id"],
      unique: true,
      where: "pickup_request_id IS NOT NULL",
    },
    {
      on: ["arrival_request_id"],
      unique: true,
      where: "arrival_request_id IS NOT NULL",
    },
    {
      on: ["handover_request_id"],
      unique: true,
      where: "handover_request_id IS NOT NULL",
    },
    // The recovery sweep's read of unassigned work past its deadline (#162).
    {
      on: ["claim_deadline", "id"],
      where: "assigned_agent_id IS NULL AND terminal_outcome IS NULL",
    },
    // The recovery sweep's read of native fulfillment still owed.
    {
      on: ["native_sync_queued_at"],
      where:
        "((picked_up_at IS NOT NULL AND native_fulfillment_id IS NULL) OR (terminal_outcome = 'delivered' AND native_delivered_at IS NULL))",
    },
    // The recovery sweep's read of ended work not yet on the Order (#204).
    {
      on: ["terminal_at", "id"],
      where:
        "terminal_outcome IS NOT NULL AND order_outcome_recorded_at IS NULL",
    },
    // The agent's own completed history, newest first.
    {
      on: ["assigned_agent_id", "terminal_at", "id"],
      where: "terminal_outcome IS NOT NULL",
    },
  ])

export default IntendedDelivery
