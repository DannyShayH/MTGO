import { model } from "@medusajs/framework/utils"

/** One accepted Order's immutable pickup and destination facts. */
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
  })
  .indexes([
    { on: ["order_id"], unique: true },
    { on: ["assigned_agent_id", "accepted_at", "id"] },
  ])

export default IntendedDelivery
