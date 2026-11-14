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
    menu_categories: model.hasMany(() => MenuCategory, {
      mappedBy: "restaurant",
    }),
    history_entries: model.hasMany(() => RestaurantHistoryEntry, {
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
    invitation: model
      .hasOne(() => StaffInvitation, { mappedBy: "staff" })
      .nullable(),
  })
  .cascades({ delete: ["invitation"] })
  .indexes([
    { on: ["email"], unique: true, where: "status != 'revoked'" },
    { on: ["restaurant_id"] },
  ])

/**
 * The current invite token of one pending staff member, as in Medusa's admin
 * invite pattern. Resending replaces the token; cancelling deletes the
 * invitation with its pending staff member.
 */
export const StaffInvitation = model
  .define("staff_invitation", {
    id: model.id({ prefix: "rsinv" }).primaryKey(),
    token: model.text(),
    expires_at: model.dateTime(),
    staff: model.belongsTo(() => RestaurantStaff, { mappedBy: "invitation" }),
  })
  .indexes([{ on: ["staff_id"], unique: true }])

/**
 * One change of participation or opening, append-only (ADR-0014). The actor's
 * name is a snapshot, so history keeps it when the person later changes or
 * leaves. Billing derives active Copenhagen days from these entries (ADR-0006).
 */
export const RestaurantHistoryEntry = model
  .define("restaurant_history_entry", {
    id: model.id({ prefix: "rshe" }).primaryKey(),
    kind: model.enum(["activated", "deactivated", "opened", "closed"]),
    occurred_at: model.dateTime(),
    actor_type: model.enum(["user", "restaurant_staff"]),
    actor_id: model.text(),
    actor_name: model.text(),
    reason: model.text().nullable(),
    restaurant: model.belongsTo(() => Restaurant, {
      mappedBy: "history_entries",
    }),
  })
  .indexes([{ on: ["restaurant_id", "occurred_at"] }])

/** Bilingual publication, revision and successful-change history share one atomic row write. */
export const MenuCategory = model
  .define("menu_category", {
    id: model.id({ prefix: "mcat" }).primaryKey(),
    name_da: model.text(),
    name_en: model.text(),
    revision: model.number().default(1),
    position: model.number().default(0),
    request_id: model.text(),
    creation_name: model.json(),
    is_removed: model.boolean().default(false),
    history: model.json(),
    restaurant: model.belongsTo(() => Restaurant, {
      mappedBy: "menu_categories",
    }),
  })
  .indexes([{ on: ["restaurant_id", "request_id"], unique: true }])

export default Restaurant
