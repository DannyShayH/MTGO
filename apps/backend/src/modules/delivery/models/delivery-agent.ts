import { model } from "@medusajs/framework/utils"

/** Identity and authorization survive invitation cancellation and access revocation. */
const DeliveryAgent = model
  .define("delivery_agent", {
    id: model.id({ prefix: "dagt" }).primaryKey(),
    name: model.text(),
    email: model.text(),
    status: model.enum(["pending", "authorized", "revoked"]),
    invited_by: model.text(),
    accepted_at: model.dateTime().nullable(),
    revoked_at: model.dateTime().nullable(),
    revoked_by: model.text().nullable(),
    authorization_revision: model.number().default(1),
    invitation: model
      .hasOne(() => DeliveryAgentInvitation, { mappedBy: "agent" })
      .nullable(),
    approved_areas: model.hasMany(() => DeliveryAgentArea, {
      mappedBy: "agent",
    }),
  })
  .indexes([{ on: ["email"], unique: true, where: "status != 'revoked'" }])

export const DeliveryAgentInvitation = model
  .define("delivery_agent_invitation", {
    id: model.id({ prefix: "dainv" }).primaryKey(),
    token: model.text(),
    expires_at: model.dateTime(),
    agent: model.belongsTo(() => DeliveryAgent, { mappedBy: "invitation" }),
  })
  .indexes([
    { on: ["agent_id"], unique: true },
    { on: ["token"], unique: true },
  ])

export const DeliveryAgentArea = model
  .define("delivery_agent_area", {
    id: model.id({ prefix: "daarea" }).primaryKey(),
    postal_code: model.text(),
    agent: model.belongsTo(() => DeliveryAgent, { mappedBy: "approved_areas" }),
  })
  .indexes([{ on: ["agent_id", "postal_code"], unique: true }])

export default DeliveryAgent
