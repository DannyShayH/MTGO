import { model } from "@medusajs/framework/utils"

/**
 * One attempt by the responsible agent to reach the Customer after arrival
 * (#164; spec #48 story 37), with the server's time. It records that the
 * agent tried, never that the Customer was reached: there is no outcome.
 * The unique retry identity makes a repeated request the same attempt.
 */
const DeliveryContactAttempt = model
  .define("delivery_contact_attempt", {
    id: model.id({ prefix: "dcat" }).primaryKey(),
    order_id: model.text(),
    agent_id: model.text(),
    request_id: model.text(),
    attempted_at: model.dateTime(),
  })
  .indexes([
    { on: ["request_id"], unique: true },
    { on: ["order_id", "attempted_at"] },
  ])

export default DeliveryContactAttempt
