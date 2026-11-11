import { model } from "@medusajs/framework/utils"

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
  })
  .indexes([{ on: ["pickup_address_key"] }])

export default Restaurant
