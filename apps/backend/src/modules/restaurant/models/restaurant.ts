import { model } from "@medusajs/framework/utils"

// The models reference each other, so they share one file: separate files
// would form an import cycle, which the architecture rules forbid.

const Restaurant = model
  .define("restaurant", {
    id: model.id({ prefix: "res" }).primaryKey(),
    name: model.text().searchable(),
    address_street: model.text(),
    address_postal_code: model.text().searchable(),
    address_city: model.text(),
    contact_phone: model.text(),
    contact_email: model.text(),
    is_active: model.boolean().default(false),
    is_open: model.boolean().default(false),
    pickup_address_key: model.text(),
    delivery_area_postal_codes: model.hasMany(() => DeliveryAreaPostalCode, {
      mappedBy: "restaurant",
    }),
    commercial_terms_agreements: model.hasMany(() => CommercialTermsAgreement, {
      mappedBy: "restaurant",
    }),
    staff: model.hasMany(() => RestaurantStaff, {
      mappedBy: "restaurant",
    }),
  })
  .indexes([{ on: ["pickup_address_key"] }])

export const DeliveryAreaPostalCode = model
  .define("delivery_area_postal_code", {
    id: model.id({ prefix: "dapc" }).primaryKey(),
    postal_code: model.text(),
    restaurant: model.belongsTo(() => Restaurant, {
      mappedBy: "delivery_area_postal_codes",
    }),
  })
  .indexes([{ on: ["restaurant_id", "postal_code"], unique: true }])

/** At most one current agreement per Restaurant; removed agreements stay soft-deleted (ADR-0014). */
export const CommercialTermsAgreement = model
  .define("commercial_terms_agreement", {
    id: model.id({ prefix: "cta" }).primaryKey(),
    terms_version: model.enum(["common_mvp_v1"]),
    agreed_at: model.dateTime(),
    recorded_by: model.text(),
    restaurant: model.belongsTo(() => Restaurant, {
      mappedBy: "commercial_terms_agreements",
    }),
  })
  .indexes([{ on: ["restaurant_id"], unique: true }])

/**
 * A person who may operate one Restaurant. Revoked staff stay on record as
 * former staff (ADR-0008, ADR-0014), so an email is unique only among pending
 * and authorized staff.
 */
export const RestaurantStaff = model
  .define("restaurant_staff", {
    id: model.id({ prefix: "rstf" }).primaryKey(),
    name: model.text(),
    email: model.text(),
    status: model.enum(["pending", "authorized", "revoked"]),
    invited_by: model.text().nullable(),
    accepted_at: model.dateTime().nullable(),
    revoked_at: model.dateTime().nullable(),
    revoked_by: model.text().nullable(),
    restaurant: model.belongsTo(() => Restaurant, { mappedBy: "staff" }),
  })
  .indexes([
    { on: ["email"], unique: true, where: "status != 'revoked'" },
    { on: ["restaurant_id"] },
  ])

export default Restaurant
