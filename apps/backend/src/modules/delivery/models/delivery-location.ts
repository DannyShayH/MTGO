import { model } from "@medusajs/framework/utils"

/**
 * The responsible agent's latest shared position for one collected, active
 * delivery (#166; spec #48 stories 51-58). At most one per Order: each
 * accepted sample replaces it, and the terminal outcome deletes it in the
 * same transaction, so no route history exists. It is kept apart from the
 * permanent milestones on `IntendedDelivery`. It keeps no agent identity:
 * responsibility is read from the delivery itself.
 *
 * `observed_at` is when the phone measured the position (never later than
 * its receipt), `received_at` when the server accepted it; freshness is read
 * from the observation. `revision` counts accepted samples, so consumers can
 * tell a replaced sample from a repeated read.
 */
const DeliveryLocation = model
  .define("delivery_location", {
    id: model.id({ prefix: "dloc" }).primaryKey(),
    order_id: model.text(),
    // Stored as `real`: about a meter of resolution, below a phone's own
    // accuracy radius, which is all the Customer's map needs.
    latitude: model.float(),
    longitude: model.float(),
    /** The phone's reported accuracy radius in meters, when it gave one. */
    accuracy_m: model.float().nullable(),
    observed_at: model.dateTime(),
    received_at: model.dateTime(),
    revision: model.number(),
  })
  .indexes([{ on: ["order_id"], unique: true }])

export default DeliveryLocation
